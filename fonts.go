package main

import "github.com/quietseek/markgo/internal/fonts"

// ListFonts 按需读取本机字体；不把字体文件传给前端。
func (b *Bridge) ListFonts() []fonts.Font {
	return fonts.List()
}
