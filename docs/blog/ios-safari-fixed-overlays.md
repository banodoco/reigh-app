---
title: Fixing Fixed Overlays on iPad Safari (And Why Your Component Library Matters)
slug: ios-safari-fixed-overlays
date: 2025-06-12
description: Three CSS fixes for iOS Safari's viewport-shifting behavior on fixed overlays, and why component library choice matters for touch-heavy apps.
author: Peter O'Malley
---

# Fixing Fixed Overlays on iPad Safari (And Why Your Component Library Matters)

We built a fullscreen lightbox — image on the left, scrollable panel on the right. It worked everywhere except iPad Safari, where touching the image area shifted the entire overlay upward, leaving a gap at the bottom. Closing and reopening made it worse.

![Before: overlay shifts upward on touch, leaving a gap at the bottom](/images/blog/ios-safari-before.png)

If you've built a modal or lightbox for iPad Safari, you've probably hit some version of this. There are a lot of partial answers online. The reason none of them fully worked for us is that there are multiple interacting issues.

## The Three Fixes

### 1. `touch-action: none` on non-scrollable regions (the main fix)

Touching and dragging on a non-scrollable part of the overlay (like an image display area) causes iOS Safari to rubber-band the visual viewport. The overlay shifts, a gap appears, and it slowly bounces back.

The fix is `touch-action: none` on those regions. But there's a trap that took us the longest to find:

### The `touch-action` Intersection Rule

**`touch-action` uses ancestor intersection, not child override.**

Most CSS properties let children override parents. `touch-action` doesn't. The browser computes the effective touch action by intersecting the values of the target element and ALL its ancestors. `none ∩ pan-y = none`.

This means if you put `touch-action: none` on a parent container to block scrolling, and then try to re-enable it on a scrollable child panel with `touch-action: pan-y` — **it doesn't work**. The child's `pan-y` is silently ignored.

```
❌ DON'T — kills scrolling everywhere

<div style="touch-action: none">          ← ancestor
  <div style="touch-action: pan-y">      ← ignored! intersection = none
    scrollable panel
  </div>
</div>
```

The fix is to use **sibling isolation**: put `touch-action: none` on siblings of your scroll containers, not on shared ancestors.

```
✅ DO — sibling isolation

<div>                                         ← neutral ancestor
  <div style="touch-action: none">           ← non-scrollable sibling
    image display, media, etc.
  </div>
  <div style="overscroll-behavior: contain"> ← scrollable sibling
    scrollable panel
  </div>
</div>
```

This way the scroll container's ancestor chain is clean, and its `touch-action` resolves as expected. The non-scrollable sibling blocks browser gestures only within its own subtree.

### 2. `overscroll-behavior: contain` on scrollable regions

When a user scrolls your side panel and hits the boundary, the scroll event "chains" to the next scrollable ancestor — typically the body. This can trigger iOS Safari's address bar animation, which shifts the viewport.

**Fix:** `overscroll-behavior: contain` on every scrollable container inside the overlay:

```css
.scrollable-panel {
  overflow-y: auto;
  overscroll-behavior: contain; /* Safari 16+ */
}
```

### 3. Don't use `100dvh` on fixed overlays

On a `position: fixed` overlay, you might set `height: 100dvh` to fill the viewport. On iOS Safari, `dvh` changes as the address bar shows and hides, so your overlay resizes in real time.

Use `inset: 0` instead, which fills the viewport stably:

```css
.overlay {
  position: fixed;
  inset: 0; /* stable — doesn't change with address bar */
  /* NOT height: 100dvh */
}
```

### Defense in depth: `position: fixed` on the body

If your `touch-action` coverage isn't complete across all layout variants (e.g., you have mobile layouts, portrait layouts, or edge cases where touches can land outside your non-scrollable regions), you may also want to lock the body with `position: fixed` + scroll position save/restore:

```js
// On open
const scrollY = window.scrollY;
document.body.style.position = 'fixed';
document.body.style.top = `-${scrollY}px`;
document.body.style.width = '100%';
document.body.style.overflow = 'hidden';

// On close
document.body.style.position = '';
document.body.style.top = '';
document.body.style.width = '';
document.body.style.overflow = '';
window.scrollTo(0, scrollY);
```

Note: `overflow: hidden` alone doesn't work on iOS Safari ([WebKit bug #153852](https://bugs.webkit.org/show_bug.cgi?id=153852)) — `position: fixed` is what actually prevents touch-scrolling the body. The scroll save/restore prevents dirty state from accumulating across open/close cycles.

This is a heavier approach and can conflict with other code that manipulates body styles, so treat it as a safety net rather than a primary fix.

## Summary

| iOS Safari behavior | Fix |
|---|---|
| Touches rubber-band visual viewport | `touch-action: none` on non-scrollable **siblings** |
| Scroll chains to body at boundaries | `overscroll-behavior: contain` on scroll containers |
| `100dvh` resizes with address bar | Use `inset: 0` instead on fixed elements |

## Why Your Component Library Matters

Before finding this solution, we spent a day trying to fix the same issue using Radix UI's Dialog. Radix ships with RemoveScroll, its own scroll-locking system that intercepts touch events and manipulates body styles. On iOS Safari, it doesn't fully work — [radix-ui/primitives#3078](https://github.com/radix-ui/primitives/issues/3078) and [radix-ui/website#424](https://github.com/radix-ui/website/issues/424) have been open for a while.

The harder problem was that we couldn't easily work around it. Applying our own `position: fixed` body fix conflicted with RemoveScroll's body manipulation. Adding `touch-action: none` interacted unpredictably with Radix's event interception. We were debugging two systems at once — iOS Safari and the framework's scroll lock — and couldn't tell which was causing what.

We switched to [Base UI](https://base-ui.com)'s Dialog, which let us opt out of all the implicit behavior:

```jsx
<Dialog.Root
  open={true}
  modal={false}              // No scroll locking — we handle it
  disablePointerDismissal    // No event interception — we handle it
  onOpenChange={(open, e) => {
    e.cancel();              // No internal state changes
    e.allowPropagation();    // No event suppression
  }}
>
```

With `modal={false}`, Base UI does no scroll locking, no touch event interception, and no body style manipulation. It gives you a portal, a backdrop, a popup, and accessibility attributes. The rest is yours.

The tradeoff is real — Base UI made us do the work ourselves. But the fixes in this post worked because nothing in the library was silently undoing them.

## Takeaway

For touch-heavy applications on iOS Safari, pay attention to what your component library does implicitly. Built-in scroll locking is convenient until it breaks on your target platform and you can't opt out. Sometimes you want a library that gives you primitives and gets out of the way.

![After: overlay stays locked in place, no shifting](/images/blog/ios-safari-after.png)

You can see our full implementation in [this commit](https://github.com/banodoco/Reigh/commit/bc40f9d5).
