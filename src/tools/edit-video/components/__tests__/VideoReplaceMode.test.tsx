import { describe, it, expect } from 'vitest';
import { ReplaceTimeline, ReplacePanelContent, useReplaceMode, ReplaceVideoOverlay } from '../VideoReplaceMode';

describe('VideoReplaceMode', () => {
  it('exports expected members', () => {
    expect(ReplaceTimeline).toBeDefined();
    expect(ReplacePanelContent).toBeDefined();
    expect(useReplaceMode).toBeDefined();
    expect(ReplaceVideoOverlay).toBeDefined();
  });
});
