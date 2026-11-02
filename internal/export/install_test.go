package export

import (
	"errors"
	"strings"
	"testing"
)

func TestInstallPlans(t *testing.T) {
	for _, goos := range []string{"windows", "darwin", "linux"} {
		for _, tool := range []string{ToolPandoc, ToolPDF} {
			if _, ok := installPlans(goos, tool); !ok {
				t.Fatalf("missing plan %s/%s", goos, tool)
			}
		}
	}
	if _, ok := installPlans("linux", "foo"); ok {
		t.Fatal("unknown tool should have no plan")
	}
	p, _ := installPlans("windows", ToolPandoc)
	if got := strings.Join(p.args, " "); got != "install --source winget --exact --id JohnMacFarlane.Pandoc" {
		t.Fatalf("args=%q", got)
	}
}

func TestInstallErrorKeepsLastLines(t *testing.T) {
	out := "\x1b[32mstep 1\x1b[0m\n  ██▒▒  10%\r  ████ 100%\r\nE: Unable to locate package pandoc\n"
	msg := installError(errors.New("exit status 100"), out).Error()
	if !strings.Contains(msg, "Unable to locate package pandoc") || strings.Contains(msg, "\x1b") || strings.Contains(msg, "10%") {
		t.Fatalf("msg=%q", msg)
	}
}

func TestAppleString(t *testing.T) {
	if got := appleString(`'/opt/homebrew/bin/brew' install "x" \`); got != `"'/opt/homebrew/bin/brew' install \"x\" \\"` {
		t.Fatalf("got %s", got)
	}
}
