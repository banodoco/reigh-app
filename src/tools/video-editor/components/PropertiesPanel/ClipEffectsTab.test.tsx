import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipEffectsTab } from './ClipEffectsTab';

const panelLifecycle = vi.hoisted(() => ({
  evaluated: 0,
  mounted: 0,
  unmounted: 0,
}));

vi.mock('@/tools/video-editor/components/EffectCreatorPanel.tsx', async () => {
  panelLifecycle.evaluated += 1;
  const { useEffect } = await import('react');

  return {
    EffectCreatorPanel: ({
      open,
      onOpenChange,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => {
      useEffect(() => {
        panelLifecycle.mounted += 1;
        return () => {
          panelLifecycle.unmounted += 1;
        };
      }, []);

      return (
        <div data-testid="effect-creator-panel" data-open={open}>
          <button type="button" onClick={() => onOpenChange(false)}>Close creator</button>
        </div>
      );
    },
  };
});

vi.mock('./ClipEntranceEffectField.tsx', () => ({ ClipEntranceEffectField: () => null }));
vi.mock('./ClipExitEffectField.tsx', () => ({ ClipExitEffectField: () => null }));
vi.mock('./ClipContinuousEffectField.tsx', () => ({ ClipContinuousEffectField: () => null }));
vi.mock('./ClipShaderSection.tsx', () => ({ ClipShaderSection: () => null }));
vi.mock('./ClipTransitionSection.tsx', () => ({ ClipTransitionSection: () => null }));

function Harness() {
  const [creatorOpen, setCreatorOpen] = useState(false);

  return (
    <ClipEffectsTab
      clip={{ assetEntry: undefined } as never}
      onChange={vi.fn()}
      effectResources={{ canCreateEffect: true, canUpdateEffect: true } as never}
      clipDescriptor={undefined}
      clipTypeResolution={{ status: 'unavailable' } as never}
      isEffectLayer={false}
      isSequenceClip={false}
      registry={undefined as never}
      currentTime={0}
      creatorOpen={creatorOpen}
      setCreatorOpen={setCreatorOpen}
      editingEffect={null}
      setEditingEffect={vi.fn()}
    />
  );
}

describe('ClipEffectsTab effect creator loading', () => {
  beforeEach(() => {
    panelLifecycle.evaluated = 0;
    panelLifecycle.mounted = 0;
    panelLifecycle.unmounted = 0;
  });

  it('defers the panel until first open and keeps it mounted across close/reopen', async () => {
    render(<Harness />);

    expect(panelLifecycle.evaluated).toBe(0);
    expect(screen.queryByTestId('effect-creator-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create Effect' }));

    await waitFor(() => {
      expect(screen.getByTestId('effect-creator-panel')).toHaveAttribute('data-open', 'true');
    });
    expect(panelLifecycle.evaluated).toBe(1);
    expect(panelLifecycle.mounted).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close creator' }));
    expect(screen.getByTestId('effect-creator-panel')).toHaveAttribute('data-open', 'false');
    expect(panelLifecycle.unmounted).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Create Effect' }));

    expect(screen.getByTestId('effect-creator-panel')).toHaveAttribute('data-open', 'true');
    expect(panelLifecycle.evaluated).toBe(1);
    expect(panelLifecycle.mounted).toBe(1);
    expect(panelLifecycle.unmounted).toBe(0);
  });
});
