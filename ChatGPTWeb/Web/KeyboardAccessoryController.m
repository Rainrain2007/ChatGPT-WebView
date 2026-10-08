#import "KeyboardAccessoryController.h"
#import <objc/runtime.h>
#include <stdlib.h>

// The accessory getters follow the older HideIMEBar behavior.
typedef UITextInputAssistantItem *(*AssistantGetter)(id, SEL);
typedef id (*AccessoryGetter)(id, SEL);
static AssistantGetter originalGetter;
static AccessoryGetter originalAccessoryViewGetter;
static AccessoryGetter originalAccessoryViewControllerGetter;
static NSHashTable<WKWebView *> *registeredViews;
static const char savedGroupsKey;
static const char savedAllowsHidingShortcutsKey;

static BOOL isRegisteredWebViewDescendant(UIView *view) {
    for (WKWebView *webView in registeredViews) {
        if ([view isDescendantOfView:webView]) return YES;
    }
    return NO;
}

static IMP installScopedHook(Class cls, SEL selector, IMP replacement) {
    Method method = class_getInstanceMethod(cls, selector);
    if (!method || method_getNumberOfArguments(method) != 2) return NULL;

    unsigned int count = 0;
    Method *methods = class_copyMethodList(cls, &count);
    Method ownMethod = NULL;
    for (unsigned int i = 0; i < count; i++) {
        if (method_getName(methods[i]) == selector) {
            ownMethod = methods[i];
            break;
        }
    }
    free(methods);

    IMP original = method_getImplementation(method);
    if (ownMethod) {
        method_setImplementation(ownMethod, replacement);
    } else if (!class_addMethod(cls, selector, replacement,
                                method_getTypeEncoding(method))) {
        return NULL;
    }
    return original;
}

static void updateGroups(UITextInputAssistantItem *item, BOOL hidden) {
    if (!item) return;
    NSArray *saved = objc_getAssociatedObject(item, &savedGroupsKey);
    if (hidden) {
        if (!saved) {
            objc_setAssociatedObject(item, &savedGroupsKey,
                @[item.leadingBarButtonGroups, item.trailingBarButtonGroups],
                OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        if (item.leadingBarButtonGroups.count) item.leadingBarButtonGroups = @[];
        if (item.trailingBarButtonGroups.count) item.trailingBarButtonGroups = @[];
        if (!objc_getAssociatedObject(item, &savedAllowsHidingShortcutsKey)) {
            objc_setAssociatedObject(item, &savedAllowsHidingShortcutsKey,
                @(item.allowsHidingShortcuts), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        if (!item.allowsHidingShortcuts) item.allowsHidingShortcuts = YES;
    } else if (saved.count == 2) {
        item.leadingBarButtonGroups = saved[0];
        item.trailingBarButtonGroups = saved[1];
        objc_setAssociatedObject(item, &savedGroupsKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    if (!hidden) {
        NSNumber *savedAllowsHidingShortcuts =
            objc_getAssociatedObject(item, &savedAllowsHidingShortcutsKey);
        if (savedAllowsHidingShortcuts) {
            item.allowsHidingShortcuts = savedAllowsHidingShortcuts.boolValue;
            objc_setAssociatedObject(item, &savedAllowsHidingShortcutsKey, nil,
                                     OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
    }
}

static UITextInputAssistantItem *assistantGetter(id object, SEL selector) {
    UITextInputAssistantItem *item = originalGetter(object, selector);
    BOOL hidden = NO;
    if ([object isKindOfClass:UIView.class]) {
        hidden = isRegisteredWebViewDescendant((UIView *)object);
    }
    updateGroups(item, hidden);
    return item;
}

static id accessoryViewGetter(id object, SEL selector) {
    if ([object isKindOfClass:UIView.class] &&
        isRegisteredWebViewDescendant((UIView *)object)) return nil;
    return originalAccessoryViewGetter(object, selector);
}

static id accessoryViewControllerGetter(id object, SEL selector) {
    if ([object isKindOfClass:UIView.class] &&
        isRegisteredWebViewDescendant((UIView *)object)) return nil;
    return originalAccessoryViewControllerGetter(object, selector);
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
    if (hidden && (!originalGetter || !originalAccessoryViewGetter ||
                   !originalAccessoryViewControllerGetter)) {
        Class cls = objc_getClass("WKContentView");
        if (cls && !originalGetter) {
            originalGetter = (AssistantGetter)installScopedHook(
                cls, @selector(inputAssistantItem), (IMP)assistantGetter);
        }
        if (cls && !originalAccessoryViewGetter) {
            originalAccessoryViewGetter = (AccessoryGetter)installScopedHook(
                cls, @selector(inputAccessoryView), (IMP)accessoryViewGetter);
        }
        if (cls && !originalAccessoryViewControllerGetter) {
            originalAccessoryViewControllerGetter = (AccessoryGetter)installScopedHook(
                cls, @selector(inputAccessoryViewController),
                (IMP)accessoryViewControllerGetter);
        }
    }
    updateGroups(webView.inputAssistantItem, hidden);
    updateResponder(webView, hidden);
}
@end
