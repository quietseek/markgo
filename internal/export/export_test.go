package export

import (
	"slices"
	"strings"
	"testing"
)

func TestSplitArgs(t *testing.T) {
	got, err := SplitArgs(`--toc -V "mainfont=Noto Serif" --metadata='author=A B'`)
	want := []string{"--toc", "-V", "mainfont=Noto Serif", "--metadata=author=A B"}
	if err != nil || !slices.Equal(got, want) {
		t.Fatalf("%q %v", got, err)
	}
	if _, err := SplitArgs(`"open`); err == nil {
		t.Fatal("unclosed quote accepted")
	}
}

func TestArgs(t *testing.T) {
	f, _ := FindFormat("docx")
	args, err := Args(f, Options{TOC: true, DocxReference: "/r.docx", FormatArgs: map[string]string{"docx": "--shift-heading-level-by=1"}}, "# hi", "/doc", "/out.docx", "hi", "3.1")
	if err != nil {
		t.Fatal(err)
	}
	s := strings.Join(args, " ")
	for _, want := range []string{"-t docx", "-o /out.docx", "--resource-path=/doc", "--toc", "--reference-doc=/r.docx", "--shift-heading-level-by=1"} {
		if !strings.Contains(s, want) {
			t.Fatalf("missing %q in %s", want, s)
		}
	}

	pdf, _ := FindFormat("pdf")
	args, _ = Args(pdf, Options{PdfEngine: "xelatex", Margin: "2cm"}, "中文", "", "/o.pdf", "", "3.1")
	s = strings.Join(args, " ")
	if !strings.Contains(s, "--pdf-engine=xelatex") || !strings.Contains(s, "CJKmainfont=") || !strings.Contains(s, "geometry:margin=2cm") || strings.Contains(s, "-t pdf") {
		t.Fatal(s)
	}

	html, _ := FindFormat("html")
	args, _ = Args(html, Options{HTMLEmbed: true}, "x", "", "/o.html", "", "2.18")
	if !slices.Contains(args, "--self-contained") {
		t.Fatal(args)
	}

	epub, _ := FindFormat("epub")
	args, _ = Args(epub, Options{}, "---\ntitle: X\n---\nbody", "", "/o.epub", "doc", "3.1")
	if slices.Contains(args, "title=doc") {
		t.Fatal("title overrides front matter")
	}
}

func TestVersionAtLeast(t *testing.T) {
	for v, want := range map[string]bool{"3.1.11": true, "2.19": true, "2.18.1": false, "2.19.2": true, "": false} {
		if versionAtLeast(v, 2, 19) != want {
			t.Fatal(v)
		}
	}
}

func TestPaperSizes(t *testing.T) {
	pdf, _ := FindFormat("pdf")
	args, _ := Args(pdf, Options{PdfEngine: "xelatex", PaperSize: "b5", Landscape: true}, "x", "", "/o.pdf", "", "3.1")
	s := strings.Join(args, " ")
	if !strings.Contains(s, "papersize=b5") || !strings.Contains(s, "geometry:landscape") {
		t.Fatal(s)
	}
	args, _ = Args(pdf, Options{PdfEngine: "typst", PaperSize: "letter"}, "x", "", "/o.pdf", "", "3.1")
	if !slices.Contains(args, "papersize=us-letter") {
		t.Fatal(args)
	}
	args, _ = Args(pdf, Options{PdfEngine: "xelatex", PaperSize: "bogus"}, "x", "", "/o.pdf", "", "3.1")
	if !slices.Contains(args, "papersize=a4") {
		t.Fatal(args)
	}
}
