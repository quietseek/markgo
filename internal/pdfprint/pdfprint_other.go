//go:build !windows && !(darwin && cgo) && !(linux && cgo && !gtk3 && !android && !server)

package pdfprint

func start(Window, string, Options, chan<- error) error { return ErrUnsupported }
