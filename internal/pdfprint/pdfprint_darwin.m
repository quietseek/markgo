// macOS：用 WKWebView 的打印操作把页面存储为 PDF。
// WKWebView 只能用 runOperationModalForWindow 异步打印（runOperation 会得到空白页），完成后回调 Go。

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include <stdint.h>

extern void markgoPrintPDFDone(uintptr_t id, int ok);

@interface MarkGoPrintDelegate : NSObject
@property (nonatomic) uintptr_t printID;
@end

@implementation MarkGoPrintDelegate
- (void)printOperationDidRun:(NSPrintOperation *)op success:(BOOL)success contextInfo:(void *)info {
	markgoPrintPDFDone(self.printID, success ? 1 : 0);
	CFRelease((__bridge CFTypeRef)self); // 与发起时的 CFBridgingRetain 对应
}
@end

static WKWebView *findWebView(NSView *view) {
	if ([view isKindOfClass:[WKWebView class]]) return (WKWebView *)view;
	for (NSView *sub in view.subviews) {
		WKWebView *found = findWebView(sub);
		if (found) return found;
	}
	return nil;
}

// 返回 NULL 表示已开始打印；否则为错误信息（静态字符串）
const char *markgoPrintPDF(void *window, const char *path, double width, double height,
	double top, double bottom, double left, double right, uintptr_t printID) {
	if (@available(macOS 11.0, *)) {
		NSWindow *nsWindow = (__bridge NSWindow *)window;
		WKWebView *webView = findWebView(nsWindow.contentView);
		if (!webView) return "找不到页面视图";

		NSPrintInfo *info = [[NSPrintInfo alloc] initWithDictionary:@{}];
		info.paperSize = NSMakeSize(width, height);
		info.orientation = NSPaperOrientationPortrait; // 宽高已按方向交换
		info.topMargin = top;
		info.bottomMargin = bottom;
		info.leftMargin = left;
		info.rightMargin = right;
		info.horizontalPagination = NSPrintingPaginationModeFit;
		info.verticalPagination = NSPrintingPaginationModeAutomatic;
		info.horizontallyCentered = NO;
		info.verticallyCentered = NO;
		info.jobDisposition = NSPrintSaveJob;
		info.dictionary[NSPrintJobSavingURL] = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];

		NSPrintOperation *op = [webView printOperationWithPrintInfo:info];
		op.showsPrintPanel = NO;
		op.showsProgressPanel = NO;
		// 不设置 frame 会抛出异常
		op.view.frame = webView.bounds;

		MarkGoPrintDelegate *delegate = [MarkGoPrintDelegate new];
		delegate.printID = printID;
		CFBridgingRetain(delegate); // 回调前保持存活
		[op runOperationModalForWindow:nsWindow
		                      delegate:delegate
		                didRunSelector:@selector(printOperationDidRun:success:contextInfo:)
		                   contextInfo:NULL];
		return NULL;
	}
	return "需要 macOS 11 或更新版本";
}
