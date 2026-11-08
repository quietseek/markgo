package main

// 导出：PDF 由编辑区直接打印生成，其他格式（Word、EPUB 等）通过 Pandoc 导出

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/quietseek/markgo/internal/export"
	"github.com/quietseek/markgo/internal/pdfprint"
	"github.com/quietseek/markgo/internal/platform"
	"github.com/quietseek/markgo/internal/settings"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func (b *Bridge) ExportFormats() []export.Format { return export.Formats }

// PandocStatus 检测 Pandoc；pandocPath 为设置中的路径（未保存的修改也可检测）
func (b *Bridge) PandocStatus(pandocPath string) export.Pandoc { return export.Detect(pandocPath) }

type exportRequest struct {
	Format   string `json:"format"`
	Markdown string `json:"markdown"`
	// 当前文档路径（草稿为应用数据目录中的路径）
	DocPath string `json:"docPath"`
	// 默认的导出文件名（不含扩展名）
	Title string `json:"title"`
	// 草稿等没有合适目录时为 true，保存对话框默认打开「文稿」
	Scratch bool `json:"scratch"`
}

type exportResult struct {
	Path     string `json:"path,omitempty"`
	Canceled bool   `json:"canceled,omitempty"`
	Error    string `json:"error,omitempty"`
}

// ExportDocument 选择保存位置后调用 Pandoc 导出
func (b *Bridge) ExportDocument(ctx context.Context, req exportRequest) exportResult {
	b = b.session(ctx)

	f, ok := export.FindFormat(req.Format)
	if !ok {
		return exportResult{Error: "不支持的导出格式"}
	}
	cfg := b.store.Get().Export
	if f.ID == "pdf" {
		return b.exportPDF(req, cfg)
	}
	pandoc := export.Detect(cfg.PandocPath)
	if !pandoc.Found {
		if pandoc.Error != "" {
			return exportResult{Error: pandoc.Error}
		}
		return exportResult{Error: "未找到 Pandoc，请先安装"}
	}

	docDir := ""
	if req.DocPath != "" {
		docDir = filepath.Dir(req.DocPath)
	}
	out, name, res := b.pickExportPath(req, f)
	if out == "" {
		return res
	}

	opts := export.Options{
		TOC:            cfg.TOC,
		NumberSections: cfg.NumberSections,
		ExtraArgs:      cfg.ExtraArgs,
		FormatArgs:     cfg.FormatArgs,
		DocxReference:  cfg.DocxReference,
		OdtReference:   cfg.OdtReference,
		HTMLCSS:        cfg.HTMLCSS,
		HTMLEmbed:      cfg.HTMLEmbed,
		EpubCover:      cfg.EpubCover,
	}
	args, err := export.Args(f, opts, req.Markdown, docDir, out, name, pandoc.Version)
	if err != nil {
		return exportResult{Error: err.Error()}
	}
	if docDir != "" {
		if st, err := os.Stat(docDir); err != nil || !st.IsDir() {
			docDir = ""
		}
	}
	if err := export.Run(context.Background(), pandoc.Path, args, req.Markdown, docDir); err != nil {
		return exportResult{Error: err.Error()}
	}
	return b.afterExport(cfg, out)
}

// pickExportPath 选择保存位置；out 为空时返回 res（取消或出错）
func (b *Bridge) pickExportPath(req exportRequest, f export.Format) (out, name string, res exportResult) {
	saveDir := ""
	if req.DocPath != "" {
		saveDir = filepath.Dir(req.DocPath)
	}
	if req.Scratch || saveDir == "" {
		saveDir = platform.DocumentsDir()
	}
	name = sanitizeFileName(req.Title)
	if name == "" {
		name = "导出"
	}
	out, err := b.saveDialog(saveDir, name+"."+f.Ext).AddFilter(f.Label, "*."+f.Ext).PromptForSingleSelection()
	if err != nil {
		return "", name, exportResult{Error: err.Error()}
	}
	if out == "" {
		return "", name, exportResult{Canceled: true}
	}
	if filepath.Ext(out) == "" {
		out += "." + f.Ext
	}
	return out, name, exportResult{}
}

// exportPDF 把编辑区按打印样式直接生成 PDF（前端已准备好打印样式，且为浅色主题）
func (b *Bridge) exportPDF(req exportRequest, cfg settings.ExportConfig) exportResult {
	if b.window == nil {
		return exportResult{Error: "窗口尚未创建"}
	}
	f, _ := export.FindFormat("pdf")
	out, _, res := b.pickExportPath(req, f)
	if out == "" {
		return res
	}
	paper, ok := pdfprint.PaperSizes[cfg.PaperSize]
	if !ok {
		paper = pdfprint.PaperSizes["a4"]
	}
	opts := pdfprint.Options{
		Width: paper[0], Height: paper[1], Landscape: cfg.Landscape,
		Top: cfg.MarginTop * 10, Bottom: cfg.MarginBottom * 10, Left: cfg.MarginLeft * 10, Right: cfg.MarginRight * 10,
	}
	if err := pdfprint.Print(b.window, out, opts, application.InvokeSync); err != nil {
		return exportResult{Error: err.Error()}
	}
	return b.afterExport(cfg, out)
}

// afterExport 按设置打开导出的文件或在文件夹中显示
func (b *Bridge) afterExport(cfg settings.ExportConfig, out string) exportResult {
	switch cfg.AfterExport {
	case "open":
		_ = b.app.Browser.OpenFile(out)
	case "reveal":
		_ = b.app.Env.OpenFileManager(out, true)
	}
	return exportResult{Path: out}
}

// PickExportFile 为导出设置选择参考文档、样式表或封面图片
func (b *Bridge) PickExportFile(ctx context.Context, kind string) (string, error) {
	b = b.session(ctx)

	d := b.openDialog()
	switch kind {
	case "docx":
		d.AddFilter("Word 文档", "*.docx")
	case "odt":
		d.AddFilter("OpenOffice 文档", "*.odt")
	case "css":
		d.AddFilter("样式表", "*.css")
	case "image":
		d.AddFilter("图片", "*.png;*.jpg;*.jpeg;*.gif;*.webp")
	case "pandoc":
	default:
		return "", errors.New("unknown kind")
	}
	return d.PromptForSingleSelection()
}

// 去掉文件名中不允许的字符
func sanitizeFileName(s string) string {
	s = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`<>:"/\|?*`, r) || r < 32 {
			return -1
		}
		return r
	}, s)
	return strings.Trim(strings.TrimSpace(s), ".")
}

// InstallCommand 一键安装 Pandoc 执行的命令
func (b *Bridge) InstallCommand(tool string) string { return export.InstallCommand(tool) }

// InstallTool 一键安装 Pandoc
func (b *Bridge) InstallTool(tool string) export.InstallResult {
	return export.Install(context.Background(), tool)
}
