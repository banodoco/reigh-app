import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BrowsePresetItem } from './types';
import { PresetBrowseCard } from './PresetBrowseCard';

vi.mock('@/shared/lib/media/videoUtils', () => ({
  framesToSecondsValue: (frames: number) => frames / 24,
}));

vi.mock('./CopyIdButton', () => ({
  CopyIdButton: ({ id }: { id: string }) => <span>Copy {id}</span>,
}));

vi.mock('./MediaPreview', () => ({
  MediaPreview: ({ url, type }: { url: string; type: string }) => (
    <div>
      preview:{type}:{url}
    </div>
  ),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({
    children,
    variant,
    ...props
  }: {
    children: ReactNode;
    variant?: string;
  } & Record<string, unknown>) => (
    <button type="button" data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/shared/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

function buildPreset(overrides: Partial<BrowsePresetItem> = {}): BrowsePresetItem {
  return {
    id: 'preset-1',
    type: 'phase-config',
    metadata: {
      name: 'My Phase Preset',
      description: 'Useful preset',
      created_by: { is_you: true, username: 'pom' },
      is_public: true,
      created_at: '2026-01-01T00:00:00Z',
      tags: ['fast', 'stylized'],
      use_count: 2,
      sample_generations: [
        { url: 'https://cdn.example.com/main.mp4', type: 'video', alt_text: 'Main sample' },
      ],
      main_generation: 'https://cdn.example.com/main.mp4',
      basePrompt: 'cinematic portrait',
      textBeforePrompts: 'before text',
      textAfterPrompts: 'after text',
      durationFrames: 48,
      generationTypeMode: 'vace',
      phaseConfig: {
        num_phases: 2,
        steps_per_phase: [3, 5],
        flow_shift: 6,
        sample_solver: 'euler',
        model_switch_phase: 1,
        phases: [
          { phase: 1, guidance_scale: 1.2, loras: [{ url: 'a', multiplier: '1.0' }] },
          { phase: 2, guidance_scale: 1.4, loras: [{ url: 'b', multiplier: '1.0' }, { url: 'c', multiplier: '1.0' }] },
        ],
      },
    },
    _isMyPreset: false,
    ...overrides,
  } as BrowsePresetItem;
}

function buildProps(overrides: Partial<React.ComponentProps<typeof PresetBrowseCard>> = {}) {
  return {
    preset: buildPreset(),
    selectedPresetId: null,
    intent: 'load' as const,
    onOverwrite: vi.fn(),
    onRemovePreset: vi.fn(),
    onSelectPreset: vi.fn(),
    createResource: { mutate: vi.fn(), isPending: false } as never,
    isSaved: false,
    onEdit: vi.fn(),
    onRequestDelete: vi.fn(),
    isDeletePending: false,
    ...overrides,
  };
}

describe('PresetBrowseCard', () => {
  it('renders key preset metadata and handles use/save actions in load mode', () => {
    const props = buildProps();

    render(<PresetBrowseCard {...props} />);

    expect(screen.getByText('My Phase Preset')).toBeInTheDocument();
    expect(screen.getByText('By: You')).toBeInTheDocument();
    expect(screen.getByText('Useful preset')).toBeInTheDocument();
    expect(screen.getByText('preview:video:https://cdn.example.com/main.mp4')).toBeInTheDocument();
    expect(screen.getByText('Suggested duration:')).toBeInTheDocument();
    expect(screen.getByText(/48 frames \(2.0s\)/)).toBeInTheDocument();
    expect(screen.getByText('Used 2 times')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Use Preset/i }));
    expect(props.onSelectPreset).toHaveBeenCalledWith(props.preset);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.createResource.mutate).toHaveBeenCalledWith({
      type: 'phase-config',
      metadata: props.preset.metadata,
    });
  });

  it('shows deselect action for selected preset and triggers remove handler', () => {
    const props = buildProps({ selectedPresetId: 'preset-1' });

    render(<PresetBrowseCard {...props} />);

    expect(screen.getByText('Selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deselect' }));

    expect(props.onRemovePreset).toHaveBeenCalledTimes(1);
  });

  it('uses overwrite action when intent is overwrite', () => {
    const props = buildProps({ intent: 'overwrite' });

    render(<PresetBrowseCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));

    expect(props.onOverwrite).toHaveBeenCalledWith(props.preset);
  });

  it('shows mine controls and routes edit/delete actions for owned presets', () => {
    const props = buildProps({
      preset: buildPreset({ _isMyPreset: true, metadata: { ...buildPreset().metadata, created_by: { is_you: true, username: 'pom' } } as never }),
    });

    const { container } = render(<PresetBrowseCard {...props} />);

    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    const outlineButtons = container.querySelectorAll('button[data-variant="outline"]');
    const destructiveButton = container.querySelector('button[data-variant="destructive"]');

    fireEvent.click(outlineButtons[0] as HTMLButtonElement);
    expect(props.onEdit).toHaveBeenCalledWith(props.preset);

    fireEvent.click(destructiveButton as HTMLButtonElement);
    expect(props.onRequestDelete).toHaveBeenCalledWith(props.preset, false);
  });
});
