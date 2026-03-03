import { describe, expect, it } from 'vitest';
import { themeAnimations } from '../../../config/tailwind/theme/themeAnimations';
import { themeColors } from '../../../config/tailwind/theme/themeColors';
import { themeKeyframes } from '../../../config/tailwind/theme/themeKeyframes';
import { PREVIEW_ALLOWED_HOSTS, manualVendorChunk, resolveVitePort } from '../../../config/vite/policy';

describe('tailwind theme config exports', () => {
  it('exposes expected animation tokens', () => {
    expect(themeAnimations['accordion-down']).toBe('accordion-down 0.2s ease-out');
    expect(themeAnimations['paint-particle-1']).toContain('paint-particle-sequential');
    expect(themeAnimations['paper-plane-loop']).toContain('paper-plane-loop');
    expect(themeAnimations['pulse-wave']).toContain('pulse-wave');
  });

  it('exposes expected color tokens', () => {
    expect(themeColors.border).toBe('hsl(var(--border))');
    expect(themeColors.primary.DEFAULT).toBe('hsl(var(--primary))');
    expect(themeColors.sidebar.ring).toBe('hsl(var(--sidebar-ring))');
    expect(themeColors.wes['dark-orange']).toBe('hsl(var(--wes-dark-orange))');
  });

  it('exposes expected keyframes', () => {
    expect(themeKeyframes['accordion-down'].from.height).toBe('0');
    expect(themeKeyframes['accordion-up'].to.height).toBe('0');
    expect(themeKeyframes['particle-burst']['100%'].opacity).toBe('0');
    expect(themeKeyframes['paper-plane-glide-1']['100%'].opacity).toBe('0');
  });
});

describe('vite policy utilities', () => {
  it('resolves port from env values with default fallback', () => {
    expect(resolveVitePort(undefined)).toBe(2222);
    expect(resolveVitePort('3000')).toBe(3000);
    expect(resolveVitePort('invalid')).toBe(2222);
  });

  it('routes vendor chunks to stable buckets', () => {
    expect(manualVendorChunk('/tmp/node_modules/react/index.js')).toBe('vendor-react');
    expect(manualVendorChunk('/tmp/node_modules/@tanstack/query-core/index.js')).toBe('vendor-query');
    expect(manualVendorChunk('/tmp/node_modules/@dnd-kit/core/dist/index.js')).toBe('vendor-dnd');
    expect(manualVendorChunk('/tmp/node_modules/@supabase/supabase-js/dist/index.js')).toBe('vendor-supabase');
    expect(manualVendorChunk('/tmp/node_modules/date-fns/index.js')).toBe('vendor-date');
    expect(manualVendorChunk('/tmp/src/local-module.ts')).toBeUndefined();
  });

  it('keeps preview host allow-list stable', () => {
    expect(PREVIEW_ALLOWED_HOSTS).toEqual([
      'healthcheck.railway.app',
      'reigh-production.up.railway.app',
      'reigh.art',
      'www.reigh.art',
    ]);
  });
});
