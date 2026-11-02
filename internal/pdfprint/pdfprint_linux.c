//go:build linux && cgo && !gtk3 && !android && !server

// Linux：用 WebKitPrintOperation 打印到 PDF 文件。长度单位为毫米。

#include <stdint.h>
#include <gtk/gtk.h>
#include <webkit/webkit.h>

extern void markgoPrintPDFDone(uintptr_t id, char *msg);

static void on_failed(WebKitPrintOperation *op, GError *error, gpointer data) {
	// 失败后仍会触发 finished，这里先通知错误，finished 中的通知不再生效
	markgoPrintPDFDone((uintptr_t)data, error ? error->message : "未知错误");
}

static void on_finished(WebKitPrintOperation *op, gpointer data) {
	markgoPrintPDFDone((uintptr_t)data, NULL);
	g_object_unref(op);
}

// 返回 NULL 表示已开始打印；否则为错误信息（静态字符串）
const char *markgo_print_pdf(void *webview, const char *path, double width, double height,
	double top, double bottom, double left, double right, uintptr_t id) {
	if (!WEBKIT_IS_WEB_VIEW(webview)) return "找不到页面视图";

	GError *err = NULL;
	char *uri = g_filename_to_uri(path, NULL, &err);
	if (!uri) {
		g_clear_error(&err);
		return "保存路径无效";
	}

	GtkPrintSettings *settings = gtk_print_settings_new();
	// 「打印到文件」打印机的名称会被翻译，按 GTK 的翻译取名
	gtk_print_settings_set_printer(settings, g_dgettext("gtk40", "Print to File"));
	gtk_print_settings_set(settings, GTK_PRINT_SETTINGS_OUTPUT_FILE_FORMAT, "pdf");
	gtk_print_settings_set(settings, GTK_PRINT_SETTINGS_OUTPUT_URI, uri);
	g_free(uri);

	GtkPaperSize *paper = gtk_paper_size_new_custom("markgo", "MarkGo", width, height, GTK_UNIT_MM);
	GtkPageSetup *setup = gtk_page_setup_new();
	gtk_page_setup_set_paper_size(setup, paper);
	gtk_page_setup_set_orientation(setup, GTK_PAGE_ORIENTATION_PORTRAIT); // 宽高已按方向交换
	gtk_page_setup_set_top_margin(setup, top, GTK_UNIT_MM);
	gtk_page_setup_set_bottom_margin(setup, bottom, GTK_UNIT_MM);
	gtk_page_setup_set_left_margin(setup, left, GTK_UNIT_MM);
	gtk_page_setup_set_right_margin(setup, right, GTK_UNIT_MM);
	gtk_paper_size_free(paper);

	WebKitPrintOperation *op = webkit_print_operation_new(WEBKIT_WEB_VIEW(webview));
	webkit_print_operation_set_print_settings(op, settings);
	webkit_print_operation_set_page_setup(op, setup);
	g_object_unref(settings);
	g_object_unref(setup);
	g_signal_connect(op, "failed", G_CALLBACK(on_failed), (gpointer)id);
	g_signal_connect(op, "finished", G_CALLBACK(on_finished), (gpointer)id);
	webkit_print_operation_print(op);
	return NULL;
}
