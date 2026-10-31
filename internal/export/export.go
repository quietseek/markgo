// Package export 调用 Pandoc 把 Markdown 导出为 Word、PDF、EPUB 等格式。
package export

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
)

// Format 一种导出格式
type Format struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Ext    string `json:"ext"`
	Writer string `json:"-"` // pandoc -t
}

// Formats 支持的导出格式（按菜单中的顺序）
var Formats = []Format{
	{"pdf", "PDF", "pdf", "pdf"},
	{"docx", "Word", "docx", "docx"},
	{"odt", "OpenOffice", "odt", "odt"},
	{"rtf", "RTF", "rtf", "rtf"},
	{"epub", "EPUB", "epub", "epub3"},
	{"pptx", "PowerPoint", "pptx", "pptx"},
	{"html", "HTML", "html", "html5"},
	{"latex", "LaTeX", "tex", "latex"},
	{"mediawiki", "MediaWiki", "wiki", "mediawiki"},
	{"rst", "reStructuredText", "rst", "rst"},
	{"textile", "Textile", "textile", "textile"},
	{"org", "Org Mode", "org", "org"},
	{"asciidoc", "AsciiDoc", "adoc", "asciidoc"},
	{"plain", "纯文本", "txt", "plain"},
}

func FindFormat(id string) (Format, bool) {
	i := slices.IndexFunc(Formats, func(f Format) bool { return f.ID == id })
	if i < 0 {
		return Format{}, false
	}
	return Formats[i], true
}

// Options 导出选项（与 settings.ExportConfig 对应）
type Options struct {
	TOC            bool
	NumberSections bool
	ExtraArgs      string
	FormatArgs     map[string]string
	PdfEngine      string
	PaperSize      string
	Landscape      bool
	Margin         string
	MainFont       string
	DocxReference  string
	OdtReference   string
	HTMLCSS        string
	HTMLEmbed      bool
	EpubCover      string
}

// PdfEngines 可用于 PDF 的引擎，自动选择时按此顺序查找（xelatex 对中文支持最好）
var PdfEngines = []string{"xelatex", "lualatex", "tectonic", "typst", "weasyprint", "wkhtmltopdf", "pdflatex"}

var latexEngines = []string{"xelatex", "lualatex", "pdflatex", "tectonic"}

// PaperSizes 支持的纸张：键 → {LaTeX papersize, Typst paper, wkhtmltopdf --page-size}
var PaperSizes = map[string][3]string{
	"a3":     {"a3", "a3", "A3"},
	"a4":     {"a4", "a4", "A4"},
	"a5":     {"a5", "a5", "A5"},
	"b4":     {"b4", "iso-b4", "B4"},
	"b5":     {"b5", "iso-b5", "B5"},
	"letter": {"letter", "us-letter", "Letter"},
	"legal":  {"legal", "us-legal", "Legal"},
}

// ---------- 查找程序 ----------

// 图形界面启动时 PATH 往往不含 Homebrew、TeX 等目录，这里补上常见位置
func extraDirs() []string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		local, pf, appData := os.Getenv("LOCALAPPDATA"), os.Getenv("ProgramFiles"), os.Getenv("APPDATA")
		return []string{
			filepath.Join(local, "Pandoc"),
			filepath.Join(pf, "Pandoc"),
			filepath.Join(local, "Programs", "MiKTeX", "miktex", "bin", "x64"),
			filepath.Join(pf, "MiKTeX", "miktex", "bin", "x64"),
			filepath.Join(appData, "TinyTeX", "bin", "windows"),
			filepath.Join(local, "Microsoft", "WinGet", "Links"),
			filepath.Join(home, "scoop", "shims"),
			`C:\ProgramData\chocolatey\bin`,
		}
	case "darwin":
		return []string{
			"/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/Library/TeX/texbin",
			filepath.Join(home, "Library", "TinyTeX", "bin", "universal-darwin"),
			filepath.Join(home, ".local", "bin"), filepath.Join(home, ".cargo", "bin"),
		}
	default:
		return []string{
			"/usr/local/bin", "/usr/bin", "/snap/bin",
			filepath.Join(home, ".TinyTeX", "bin", "x86_64-linux"),
			filepath.Join(home, ".local", "bin"), filepath.Join(home, ".cargo", "bin"),
		}
	}
}

var (
	pathOnce sync.Once
	fullPath string
)

// searchPath 返回查找程序用的 PATH：当前 PATH、登录 shell 的 PATH 与常见安装目录
func searchPath() string {
	pathOnce.Do(func() {
		dirs := filepath.SplitList(os.Getenv("PATH"))
		if runtime.GOOS != "windows" {
			shell := os.Getenv("SHELL")
			if shell == "" {
				shell = "/bin/sh"
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			out, err := exec.CommandContext(ctx, shell, "-lc", "printf %s \"$PATH\"").Output()
			cancel()
			if err == nil {
				dirs = append(dirs, filepath.SplitList(strings.TrimSpace(string(out)))...)
			}
		}
		dirs = append(dirs, extraDirs()...)
		var uniq []string
		for _, d := range dirs {
			if d != "" && !slices.Contains(uniq, d) {
				uniq = append(uniq, d)
			}
		}
		fullPath = strings.Join(uniq, string(os.PathListSeparator))
	})
	return fullPath
}

// lookPath 在扩展后的 PATH 中查找程序
func lookPath(name string) string {
	exts := []string{""}
	if runtime.GOOS == "windows" {
		exts = []string{".exe", ".cmd", ".bat"}
	}
	for _, dir := range filepath.SplitList(searchPath()) {
		for _, ext := range exts {
			p := filepath.Join(dir, name+ext)
			if st, err := os.Stat(p); err == nil && !st.IsDir() && (runtime.GOOS == "windows" || st.Mode()&0o111 != 0) {
				return p
			}
		}
	}
	return ""
}

// Pandoc 检测到的 Pandoc 信息
type Pandoc struct {
	Found   bool   `json:"found"`
	Path    string `json:"path"`
	Version string `json:"version"`
	Error   string `json:"error,omitempty"`
	// 本机可用的 PDF 引擎
	PdfEngines []string `json:"pdfEngines"`
}

// Detect 查找 Pandoc：custom 为用户指定的路径，留空时自动查找
func Detect(custom string) Pandoc {
	info := Pandoc{PdfEngines: []string{}}
	for _, e := range PdfEngines {
		if lookPath(e) != "" {
			info.PdfEngines = append(info.PdfEngines, e)
		}
	}
	p := strings.TrimSpace(custom)
	if p == "" {
		p = lookPath("pandoc")
		if p == "" {
			return info
		}
	} else if st, err := os.Stat(p); err != nil || st.IsDir() {
		info.Error = "找不到指定的 Pandoc：" + p
		return info
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, p, "--version")
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		info.Error = "无法运行 Pandoc：" + err.Error()
		return info
	}
	first, _, _ := strings.Cut(string(out), "\n")
	info.Found, info.Path = true, p
	info.Version = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(first), "pandoc"))
	return info
}

// versionAtLeast 比较 Pandoc 版本号（如 "3.1.11"）
func versionAtLeast(v string, want ...int) bool {
	parts := strings.FieldsFunc(v, func(r rune) bool { return r == '.' || r == ' ' || r == '-' })
	for i, w := range want {
		if i >= len(parts) {
			return false
		}
		n, err := strconv.Atoi(parts[i])
		if err != nil {
			return false
		}
		if n != w {
			return n > w
		}
	}
	return true
}

// ---------- 参数 ----------

var cjkRe = regexp.MustCompile(`[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]`)

// DefaultCJKFont 各平台用于 PDF 的默认中文字体
func DefaultCJKFont() string {
	switch runtime.GOOS {
	case "darwin":
		return "PingFang SC"
	case "windows":
		return "Microsoft YaHei"
	default:
		return "Noto Sans CJK SC"
	}
}

// SplitArgs 按 shell 规则拆分参数（支持单双引号与反斜杠转义）
func SplitArgs(s string) ([]string, error) {
	var out []string
	var cur strings.Builder
	inArg := false
	var quote rune
	escape := false
	for _, r := range s {
		switch {
		case escape:
			cur.WriteRune(r)
			escape = false
		case quote != 0:
			if r == quote {
				quote = 0
			} else if r == '\\' && quote == '"' {
				escape = true
			} else {
				cur.WriteRune(r)
			}
		case r == '"' || r == '\'':
			quote, inArg = r, true
		case r == '\\' && runtime.GOOS != "windows":
			escape, inArg = true, true
		case unicode.IsSpace(r):
			if inArg {
				out = append(out, cur.String())
				cur.Reset()
				inArg = false
			}
		default:
			cur.WriteRune(r)
			inArg = true
		}
	}
	if quote != 0 {
		return nil, errors.New("额外参数中的引号没有闭合")
	}
	if inArg {
		out = append(out, cur.String())
	}
	return out, nil
}

// Args 生成 Pandoc 命令行参数（不含程序名，输入从标准输入读取）
func Args(f Format, o Options, markdown, docDir, outPath, title, version string) ([]string, error) {
	args := []string{"-f", "markdown", "-t", f.Writer, "-s", "-o", outPath}
	if f.ID == "pdf" {
		args = []string{"-f", "markdown", "-s", "-o", outPath}
	}
	if docDir != "" {
		args = append(args, "--resource-path="+docDir)
	}
	if title != "" {
		args = append(args, "--metadata", "pagetitle="+title)
	}
	if o.TOC {
		args = append(args, "--toc")
	}
	if o.NumberSections {
		args = append(args, "--number-sections")
	}
	cjk := cjkRe.MatchString(markdown)
	font := strings.TrimSpace(o.MainFont)
	if font == "" && cjk {
		font = DefaultCJKFont()
	}

	switch f.ID {
	case "pdf":
		engine := o.PdfEngine
		if engine == "" {
			for _, e := range PdfEngines {
				if lookPath(e) != "" {
					engine = e
					break
				}
			}
			if engine == "" {
				return nil, errors.New("导出 PDF 需要 LaTeX 等 PDF 引擎，请先安装（如 MiKTeX、TeX Live、BasicTeX 或 Typst）")
			}
		}
		args = append(args, "--pdf-engine="+engine)
		paper, ok := PaperSizes[o.PaperSize]
		if !ok {
			paper = PaperSizes["a4"]
		}
		margin := strings.TrimSpace(o.Margin)
		switch {
		case slices.Contains(latexEngines, engine):
			args = append(args, "-V", "papersize="+paper[0])
			if o.Landscape {
				args = append(args, "-V", "geometry:landscape")
			}
			if margin != "" {
				args = append(args, "-V", "geometry:margin="+margin)
			}
			if font != "" {
				if cjk {
					args = append(args, "-V", "CJKmainfont="+font)
				} else {
					args = append(args, "-V", "mainfont="+font)
				}
			}
		case engine == "typst":
			// Pandoc 的 Typst 模板不支持横向，只设置纸张
			args = append(args, "-V", "papersize="+paper[1])
			if margin != "" {
				args = append(args, "-V", "margin=(x: "+margin+", y: "+margin+")")
			}
			if font != "" {
				args = append(args, "-V", "mainfont="+font)
			}
		default: // weasyprint / wkhtmltopdf 经由 HTML
			if margin != "" {
				args = append(args, "-V", "margin-top="+margin, "-V", "margin-bottom="+margin, "-V", "margin-left="+margin, "-V", "margin-right="+margin)
			}
			if engine == "wkhtmltopdf" {
				args = append(args, "--pdf-engine-opt=--page-size", "--pdf-engine-opt="+paper[2])
				if o.Landscape {
					args = append(args, "--pdf-engine-opt=--orientation", "--pdf-engine-opt=Landscape")
				}
			}
			if css := strings.TrimSpace(o.HTMLCSS); css != "" {
				args = append(args, "--css="+css)
			}
		}
	case "docx":
		if ref := strings.TrimSpace(o.DocxReference); ref != "" {
			args = append(args, "--reference-doc="+ref)
		}
	case "odt":
		if ref := strings.TrimSpace(o.OdtReference); ref != "" {
			args = append(args, "--reference-doc="+ref)
		}
	case "html":
		args = append(args, "--mathml")
		if css := strings.TrimSpace(o.HTMLCSS); css != "" {
			args = append(args, "--css="+css)
		}
		if o.HTMLEmbed {
			if versionAtLeast(version, 2, 19) {
				args = append(args, "--embed-resources")
			} else {
				args = append(args, "--self-contained")
			}
		}
	case "epub":
		args = append(args, "--mathml")
		if cover := strings.TrimSpace(o.EpubCover); cover != "" {
			args = append(args, "--epub-cover-image="+cover)
		}
		if title != "" && !hasTitle(markdown) {
			args = append(args, "--metadata", "title="+title)
		}
	}

	for _, extra := range []string{o.ExtraArgs, o.FormatArgs[f.ID]} {
		more, err := SplitArgs(extra)
		if err != nil {
			return nil, err
		}
		args = append(args, more...)
	}
	return args, nil
}

var titleRe = regexp.MustCompile(`(?m)^title\s*:`)

// hasTitle 判断 YAML front matter 中是否设置了 title
func hasTitle(md string) bool {
	if !strings.HasPrefix(md, "---") {
		return false
	}
	end := strings.Index(md[3:], "\n---")
	return end >= 0 && titleRe.MatchString(md[3:3+end])
}

// ---------- 运行 ----------

// Run 运行 Pandoc 导出；markdown 从标准输入传入，在文档所在目录运行以便解析相对路径的图片
func Run(ctx context.Context, pandoc string, args []string, markdown, docDir string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, pandoc, args...)
	hideWindow(cmd)
	if docDir != "" {
		cmd.Dir = docDir
	}
	cmd.Env = append(os.Environ(), "PATH="+searchPath())
	cmd.Stdin = strings.NewReader(markdown)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return errors.New("导出超时")
		}
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		const limit = 1500
		if len(msg) > limit {
			msg = msg[:limit] + "…"
		}
		return fmt.Errorf("Pandoc 导出失败：%s", msg)
	}
	return nil
}
