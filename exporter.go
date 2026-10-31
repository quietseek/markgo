package main

// 通过 Pandoc 导出为 Word、PDF、EPUB 等格式

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/quietseek/markgo/internal/export"
	"github.com/quietseek/markgo/internal/platform"
)

func (b *Bridge) ExportFormats() []export.Format { return export.Formats }

// PandocStatus 检测 Pandoc 与可用的 PDF 引擎；pandocPath 为设置中的路径（未保存的修改也可检测）
func (b *Bridge) PandocStatus(pandocPath string) export.Pandoc { return export.Detect(pandocPath) }

// DefaultCJKFont 导出 PDF 时默认使用的中文字体
func (b *Bridge) DefaultCJKFont() string { return export.DefaultCJKFont() }

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
func (b *Bridge) ExportDocument(req exportRequest) exportResult {
	f, ok := export.FindFormat(req.Format)
	if !ok {
		return exportResult{Error: "不支持的导出格式"}
	}
	cfg := b.store.Get().Export
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
	saveDir := docDir
	if req.Scratch || saveDir == "" {
		saveDir = platform.DocumentsDir()
	}
	name := sanitizeFileName(req.Title)
	if name == "" {
		name = "导出"
	}
	out, err := b.saveDialog(saveDir, name+"."+f.Ext).AddFilter(f.Label, "*."+f.Ext).PromptForSingleSelection()
	if err != nil {
		return exportResult{Error: err.Error()}
	}
	if out == "" {
		return exportResult{Canceled: true}
	}
	if filepath.Ext(out) == "" {
		out += "." + f.Ext
	}

	opts := export.Options{
		TOC:            cfg.TOC,
		NumberSections: cfg.NumberSections,
		ExtraArgs:      cfg.ExtraArgs,
		FormatArgs:     cfg.FormatArgs,
		PdfEngine:      cfg.PdfEngine,
		PaperSize:      cfg.PaperSize,
		Landscape:      cfg.Landscape,
		Margin:         cfg.Margin,
		MainFont:       cfg.MainFont,
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

	switch cfg.AfterExport {
	case "open":
		_ = b.app.Browser.OpenFile(out)
	case "reveal":
		_ = b.app.Env.OpenFileManager(out, true)
	}
	return exportResult{Path: out}
}

// PickExportFile 为导出设置选择参考文档、样式表或封面图片
func (b *Bridge) PickExportFile(kind string) (string, error) {
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
