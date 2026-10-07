#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

NS_ASSUME_NONNULL_BEGIN
@interface KeyboardAccessoryController : NSObject
+ (void)setHidden:(BOOL)hidden forWebView:(WKWebView *)webView NS_SWIFT_NAME(setHidden(_:for:));
@end
NS_ASSUME_NONNULL_END
