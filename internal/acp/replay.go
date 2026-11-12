package acp

import (
	"net/url"
	"strings"
)

// displayMeta is optional ACP content metadata. Agents that preserve it can
// replay the same short message shown when sending, including writing actions.
type displayMeta struct {
	Text      *string `json:"ai.markgo/displayText,omitempty"`
	Selection string  `json:"ai.markgo/selection,omitempty"`
}

// Join user chunks before removing context: an Agent may split anywhere in the
// preamble or document. Other events keep their original positions.
func displayReplay(events []Event) []Event {
	result := make([]Event, 0, len(events))
	for _, e := range events {
		last := len(result) - 1
		if e.Type == "user" && last >= 0 && result[last].Type == "user" {
			result[last].Text += e.Text
			if e.Display != nil {
				result[last].Display = e.Display
			}
			continue
		}
		result = append(result, e)
	}
	documentURI := ""
	for i := range result {
		e := &result[i]
		if e.Type != "user" {
			continue
		}
		if uri := promptDocumentURI(e.Text); uri != "" {
			documentURI = uri
		}
		if e.Display != nil && e.Display.Text != nil {
			e.Text, e.Selection = *e.Display.Text, e.Display.Selection
		} else {
			e.Text, e.Selection = stripPromptContextForDocument(e.Text, documentURI)
		}
		e.Display = nil
	}
	return result
}

// Older sessions (and Agents that discard _meta) contain only the original
// prompt. Remove our exact leading wrappers, never arbitrary matching text
// elsewhere in a user's message or an assistant reply.
func stripPromptContext(text string) (string, string) {
	return stripPromptContextForDocument(text, promptDocumentURI(text))
}

func promptDocumentURI(text string) string {
	const prefix = "[MarkGo] 用户正在 MarkGo 编辑器中写作，当前文档："
	if strings.HasPrefix(text, prefix) {
		if line, _, ok := strings.Cut(text, "\n"); ok {
			path := strings.TrimPrefix(line, prefix)
			if strings.HasPrefix(text, chatPreamble(path)+"\n\n") {
				return fileURL(path)
			}
		}
	}
	return ""
}

func stripPromptContextForDocument(text, documentURI string) (string, string) {
	text = stripDocumentResource(text, documentURI)
	const prefix = "[MarkGo] 用户正在 MarkGo 编辑器中写作，当前文档："
	if strings.HasPrefix(text, prefix) {
		if line, _, ok := strings.Cut(text, "\n"); ok {
			path := strings.TrimPrefix(line, prefix)
			text = strings.TrimPrefix(text, chatPreamble(path)+"\n\n")
		}
	}
	const fence = "\n\n````markdown\n"
	if header, rest, ok := strings.Cut(text, fence); ok && strings.HasPrefix(header, "当前文档 ") && strings.HasSuffix(header, " 的最新内容：") && !strings.Contains(header, "\n") {
		if _, tail, closed := strings.Cut(rest, "\n````\n\n"); closed {
			text = tail
		}
	}
	text = strings.TrimPrefix(text, "（文档较大，本条消息未附带全文，请直接读取该文件，磁盘上已是最新内容。）\n\n")
	const quote = "用户选中的文本：\n\"\"\"\n"
	if strings.HasPrefix(text, quote) {
		if selection, tail, ok := strings.Cut(strings.TrimPrefix(text, quote), "\n\"\"\"\n\n"); ok {
			return tail, selection
		}
	}
	return text, ""
}

// Codex flattens ACP resource blocks to [@name](file:...) followed by
// <context ref="file:...">the whole document</context>, discarding _meta.
// MarkGo appends these resources after the prompt. Remove only a trailing
// attachment for the document identified by our preamble, not arbitrary links
// or <context> examples in the user's own text. The closing tag is anchored at
// the end so tags and links inside the article cannot terminate it early.
func stripDocumentResource(text, documentURI string) string {
	if documentURI == "" {
		return text
	}
	for offset := 0; offset < len(text); {
		relative := strings.Index(text[offset:], "[@")
		if relative < 0 {
			break
		}
		start := offset + relative
		offset = start + 1
		link, resource, _ := strings.Cut(text[start:], "\n")
		_, target, ok := strings.Cut(link, "](")
		if !ok || !strings.HasSuffix(target, ")") {
			continue
		}
		if !sameResourceURI(strings.TrimSuffix(target, ")"), documentURI) {
			continue
		}
		if strings.TrimSpace(resource) == "" {
			return strings.TrimRight(text[:start], "\r\n")
		}
		const open = "<context ref=\""
		if !strings.HasPrefix(resource, open) {
			continue
		}
		ref, rest, ok := strings.Cut(strings.TrimPrefix(resource, open), "\">\n")
		if ok && sameResourceURI(ref, documentURI) && strings.HasSuffix(strings.TrimSpace(rest), "</context>") {
			return strings.TrimRight(text[:start], "\r\n")
		}
	}
	return text
}

func sameResourceURI(a, b string) bool {
	x, err := url.Parse(a)
	if err != nil {
		return false
	}
	y, err := url.Parse(b)
	return err == nil && x.Scheme == "file" && y.Scheme == "file" && x.Host == y.Host && samePath(x.Path, y.Path)
}
