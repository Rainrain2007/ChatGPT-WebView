#import "KeyboardAccessoryController.h"
#import <objc/runtime.h>

// Adapted from Rainrain2007/Claude-iOS16-WebView-Patches,
// src/HideIMEBarBounce.m (MIT). Only the existing inputAssistantItem hook is used.
typedef UITextInputAssistantItem *(*AssistantGetter)(id, SEL);
static AssistantGetter originalGetter;
static NSHashTable<WKWebView *> *registeredViews;
static const char savedGroupsKey;

static void updateGroups(UITextInputAssistantItem *item, BOOL hidden) {
    if (!item) return;
    NSArray *saved = objc_getAssociatedObject(item, &savedGroupsKey);
    if (hidden) {
        if (!saved) {
            objc_setAssociatedObject(item, &savedGroupsKey,
                @[item.leadingBarButtonGroups, item.trailingBarButtonGroups],
                OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        item.leadingBarButtonGroups = @[];
        item.trailingBarButtonGroups = @[];
    } else if (saved.count == 2) {
        item.leadingBarButtonGroups = saved[0];
        item.trailingBarButtonGroups = saved[1];
        objc_setAssociatedObject(item, &savedGroupsKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
}

static UITextInputAssistantItem *assistantGetter(id object, SEL selector) {
    UITextInputAssistantItem *item = originalGetter(object, selector);
    BOOL hidden = NO;
    if ([object isKindOfClass:UIView.class]) {
        for (WKWebView *webView in registeredViews) {
            if ([(UIView *)object isDescendantOfView:webView]) { hidden = YES; break; }
        }
    }
    updateGroups(item, hidden);
    return item;
}

static void updateResponder(UIView *view, BOOL hidden) {
    if (view.isFirstResponder) {
        updateGroups(view.inputAssistantItem, hidden);
        [view reloadInputViews];
    }
    for (UIView *child in view.subviews) { updateResponder(child, hidden); }
}

@implementation KeyboardAccessoryController
+ (void)setHidden:(BOOL)hidden forWebView:(WKWebView *)webView {
    NSAssert(NSThread.isMainThread, @"Keyboard configuration must run on the main thread.");
    if (!registeredViews) { registeredViews = [NSHashTable weakObjectsHashTable]; }
    if (hidden) { [registeredViews addObject:webView]; }
    else { [registeredViews removeObject:webView]; }
    // A missing class/method leaves WebKit's responder behavior untouched.
    if (hidden && !originalGetter) {
        Class cls = objc_getClass("WKContentView");
        Method method = cls ? class_getInstanceMethod(cls, @selector(inputAssistantItem)) : NULL;
        if (method && method_getNumberOfArguments(method) == 2) {
            IMP implementation = method_getImplementation(method);
            originalGetter = (AssistantGetter)implementation;
            if (!class_addMethod(cls, @selector(inputAssistantItem), (IMP)assistantGetter,
                                 method_getTypeEncoding(method))) {
                method_setImplementation(method, (IMP)assistantGetter);
            }
        }
    }
    updateGroups(webView.inputAssistantItem, hidden);
    updateResponder(webView, hidden);
}
@end
