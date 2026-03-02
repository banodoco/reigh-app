import { describe, expect, it } from 'vitest';
import {
  isFloatingOverlayElement,
  isInteractiveElement,
  shouldAllowTouchThrough,
} from './elementPolicy';

describe('elementPolicy', () => {
  it('detects interactive element tags and wrapped controls', () => {
    const button = document.createElement('button');
    expect(isInteractiveElement(button)).toBe(true);

    const anchor = document.createElement('a');
    expect(isInteractiveElement(anchor)).toBe(true);

    const spanInsideButton = document.createElement('span');
    button.appendChild(spanInsideButton);
    document.body.appendChild(button);
    expect(isInteractiveElement(spanInsideButton)).toBe(true);
  });

  it('detects floating overlay ancestors', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const child = document.createElement('span');
    menu.appendChild(child);
    document.body.appendChild(menu);

    expect(isFloatingOverlayElement(child)).toBe(true);
    expect(isFloatingOverlayElement(document.createElement('div'))).toBe(false);
  });

  it('allows touch-through for canvas overlays and interactive controls', () => {
    const canvas = document.createElement('canvas');
    const div = document.createElement('div');
    const input = document.createElement('input');

    expect(shouldAllowTouchThrough(canvas, { hasCanvasOverlay: true })).toBe(true);
    expect(shouldAllowTouchThrough(input, { hasCanvasOverlay: false })).toBe(true);
    expect(shouldAllowTouchThrough(div, { hasCanvasOverlay: false })).toBe(false);
  });
});
