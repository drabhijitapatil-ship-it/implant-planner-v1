/**
 * KeyboardAwareScrollView — drop-in replacement for react-native's ScrollView
 * that keeps the focused TextInput above the on-screen keyboard.
 *
 * Why: since Expo SDK 54 Android draws edge-to-edge, so `adjustResize` no
 * longer shrinks the window when the keyboard opens and inputs near the bottom
 * end up hidden behind it. iOS never had automatic handling.
 *
 *  • iOS     → native `automaticallyAdjustKeyboardInsets` (content inset grows
 *              by the keyboard height) + scroll the focused input into view.
 *  • Android → a spacer at the end of the content equal to how much the
 *              keyboard actually overlaps this ScrollView (0 when a parent
 *              KeyboardAvoidingView already lifted it) + scroll the focused
 *              input into view.
 *
 * Pure JS (no native module) so it is safe to ship via OTA update.
 * Horizontal scroll views, and any with `keyboardAware={false}`, behave
 * exactly like a plain ScrollView. Refs resolve to the underlying ScrollView,
 * so `scrollTo` / `scrollToEnd` keep working.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardEvent,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView as RNScrollView,
  ScrollViewProps,
  TextInput,
  View,
} from 'react-native';

type Props = ScrollViewProps & {
  /** Set false to opt out (behaves like a plain ScrollView). Default true. */
  keyboardAware?: boolean;
  /** Gap kept between the focused input and the top of the keyboard. */
  keyboardBottomOffset?: number;
  children?: React.ReactNode;
};

const DEFAULT_OFFSET = 24;

const KeyboardAwareScrollView = forwardRef<RNScrollView, Props>(function KeyboardAwareScrollView(
  { keyboardAware = true, keyboardBottomOffset = DEFAULT_OFFSET, children, onScroll, onLayout, onTouchStart, onTouchEnd, onScrollBeginDrag, ...rest },
  ref,
) {
  const scrollRef = useRef<RNScrollView>(null);
  useImperativeHandle(ref, () => scrollRef.current as RNScrollView);

  const enabled = keyboardAware && !rest.horizontal;
  const [spacer, setSpacer] = useState(0);
  const kbHeightRef = useRef(0);
  // Keyboard top edge in window coordinates (from the keyboard event).
  const kbTopRef = useRef(0);
  const offsetY = useRef(0);
  const viewHeight = useRef(0);
  // True once the current touch turned into a scroll drag.
  const dragged = useRef(false);

  // Scroll so the currently-focused input (if it lives inside this
  // ScrollView) sits above the keyboard. Silently does nothing otherwise.
  const revealFocusedInput = useCallback(() => {
    const kb = kbHeightRef.current;
    const scroll = scrollRef.current as any;
    const input = TextInput.State.currentlyFocusedInput?.() as any;
    if (!kb || !scroll || !input) return;
    const inner = scroll.getInnerViewRef?.() ?? scroll.getInnerViewNode?.();
    if (!inner || typeof input.measureLayout !== 'function') return;
    scroll.measureInWindow?.((_x: number, top: number, _w: number, h: number) => {
      // Part of this ScrollView not covered by the keyboard.
      const visibleH = Math.min(h || viewHeight.current, kbTopRef.current - top);
      if (visibleH <= 0) return;
      try {
        input.measureLayout(
          inner,
          (_ix: number, iy: number, _iw: number, ih: number) => {
            const bottom = iy + ih + keyboardBottomOffset;
            const current = offsetY.current;
            if (bottom > current + visibleH) {
              scroll.scrollTo({ y: bottom - visibleH, animated: true });
            } else if (iy < current) {
              scroll.scrollTo({ y: Math.max(0, iy - keyboardBottomOffset), animated: true });
            }
          },
          () => {}, // focused input is not inside this ScrollView
        );
      } catch {
        // measureLayout throws when the input isn't a descendant — ignore.
      }
    });
  }, [keyboardBottomOffset]);

  useEffect(() => {
    if (!enabled) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => {
      const h = e?.endCoordinates?.height || 0;
      const windowH = Dimensions.get('window').height;
      kbHeightRef.current = h;
      kbTopRef.current = e?.endCoordinates?.screenY || windowH - h;
      // Let any parent KeyboardAvoidingView / native inset settle first, then
      // add only the overlap that is still there, then reveal the input.
      setTimeout(() => {
        const scroll = scrollRef.current as any;
        if (Platform.OS === 'android' && scroll?.measureInWindow) {
          scroll.measureInWindow((_x: number, top: number, _w: number, sh: number) => {
            setSpacer(Math.max(0, Math.round(top + sh - kbTopRef.current)));
            setTimeout(revealFocusedInput, 60);
          });
        } else {
          revealFocusedInput();
        }
      }, Platform.OS === 'ios' ? 280 : 120);
    };
    const onHide = () => {
      kbHeightRef.current = 0;
      setSpacer(0);
    };
    const subs = [Keyboard.addListener(showEvt, onShow), Keyboard.addListener(hideEvt, onHide)];
    return () => subs.forEach((s) => s.remove());
  }, [enabled, revealFocusedInput]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetY.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    },
    [onScroll],
  );
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewHeight.current = e.nativeEvent.layout.height;
      onLayout?.(e);
    },
    [onLayout],
  );
  // Tapping another field while the keyboard is already open doesn't fire a
  // new keyboard-show event, so re-check after a tap inside the list. Not
  // after a scroll drag: that snapped the page back to the focused input
  // whenever the user tried to scroll away from it.
  const handleTouchStart = useCallback(
    (e: any) => {
      dragged.current = false;
      onTouchStart?.(e);
    },
    [onTouchStart],
  );
  const handleScrollBeginDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      dragged.current = true;
      onScrollBeginDrag?.(e);
    },
    [onScrollBeginDrag],
  );
  const handleTouchEnd = useCallback(
    (e: any) => {
      if (kbHeightRef.current && !dragged.current) setTimeout(revealFocusedInput, 120);
      onTouchEnd?.(e);
    },
    [onTouchEnd, revealFocusedInput],
  );

  if (!enabled) {
    return (
      <RNScrollView
        ref={scrollRef}
        onScroll={onScroll}
        onLayout={onLayout}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onScrollBeginDrag={onScrollBeginDrag}
        {...rest}
      >
        {children}
      </RNScrollView>
    );
  }

  return (
    <RNScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      scrollEventThrottle={16}
      {...rest}
      onScroll={handleScroll}
      onLayout={handleLayout}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onScrollBeginDrag={handleScrollBeginDrag}
    >
      {children}
      {/* Android: room to scroll the last inputs above the keyboard. iOS gets
          this from automaticallyAdjustKeyboardInsets instead. */}
      {Platform.OS === 'android' && spacer > 0 ? <View style={{ height: spacer }} /> : null}
    </RNScrollView>
  );
});

// Same name as a type so `useRef<ScrollView>(null)` keeps compiling after the
// import swap; instances are the underlying react-native ScrollView.
type KeyboardAwareScrollView = RNScrollView;

export default KeyboardAwareScrollView;
