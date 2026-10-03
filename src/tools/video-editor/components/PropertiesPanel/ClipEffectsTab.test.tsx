import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ClipEffectsTab } from '@/tools/video-editor/components/PropertiesPanel/ClipEffectsTab';

function renderUnavailableClipEffects(isClipTypeRegistered: boolean) {
  const props = {
    clip: { id: 'scene-1', clipType: 'com.reigh.astrid.livescene' },
    onChange: vi.fn(),
    effectResources: {},
    clipDescriptor: undefined,
    isClipTypeRegistered,
    clipTypeResolution: { status: 'unknown', clipType: 'com.reigh.astrid.livescene' },
    isEffectLayer: false,
    isSequenceClip: false,
    registry: {},
    currentTime: 0,
    creatorOpen: false,
    setCreatorOpen: vi.fn(),
    editingEffect: null,
    setEditingEffect: vi.fn(),
  } as unknown as ComponentProps<typeof ClipEffectsTab>;

  return render(<ClipEffectsTab {...props} />);
}

describe('ClipEffectsTab unavailable clip state', () => {
  it('uses a neutral message for a registered extension clip without built-in effect controls', () => {
    renderUnavailableClipEffects(true);

    expect(screen.getByText('This clip type has no built-in effect controls.')).toBeInTheDocument();
    expect(screen.queryByText(/not available in this editor build/i)).not.toBeInTheDocument();
  });

  it('keeps an availability warning for a clip type with no editor registration', () => {
    renderUnavailableClipEffects(false);

    expect(screen.getByText('com.reigh.astrid.livescene is not available in this editor build.')).toBeInTheDocument();
  });
});
