import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentSettingsForm } from './SegmentSettingsForm';
import type { SegmentSettingsFormProps } from './types';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/primitives/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}));

vi.mock('@/shared/components/ui/slider', () => ({
  Slider: () => <div data-testid="slider" />,
}));

vi.mock('./components/PromptSection', () => ({
  PromptSection: () => <div data-testid="prompt-section" />,
}));

vi.mock('./components/AdvancedSettingsSection', () => ({
  AdvancedSettingsSection: ({
    settings,
    structureVideo,
    defaults,
  }: {
    settings: SegmentSettingsFormProps['settings'];
    structureVideo?: {
      type?: SegmentSettingsFormProps['structureVideoType'];
    };
    defaults?: {
      shotDefaults?: SegmentSettingsFormProps['shotDefaults'];
    };
  }) => {
    const selectedModel = settings.selectedModel ?? defaults?.shotDefaults?.selectedModel ?? 'wan-2.2';
    const ltxSelected = selectedModel === 'ltx-2.3' || selectedModel === 'ltx-2.3-fast';
    return (
      <div data-testid="advanced-settings">
        <button type="button">WAN / VACE</button>
        <button type="button">LTX 2.3</button>
        {ltxSelected ? <button type="button">Full</button> : null}
        {ltxSelected ? <button type="button">Distilled</button> : null}
        {structureVideo?.type && selectedModel === 'ltx-2.3' ? (
          <div>Full LTX currently supports unguided travel only.</div>
        ) : null}
      </div>
    );
  },
}));

vi.mock('./hooks/useSaveFieldAsDefault', () => ({
  useSaveFieldAsDefault: () => ({
    savingField: null,
    handleSaveFieldAsDefault: vi.fn(),
  }),
}));

vi.mock('./hooks/useStructureVideoUpload', () => ({
  useStructureVideoUpload: () => ({
    isVideoLoading: false,
    addFileInputRef: { current: null },
    handleFileSelect: vi.fn(),
  }),
}));

function createProps(overrides: Partial<SegmentSettingsFormProps> = {}): SegmentSettingsFormProps {
  return {
    settings: {
      prompt: 'Prompt',
      negativePrompt: '',
      motionMode: 'basic',
      amountOfMotion: 50,
      selectedPhasePresetId: null,
      loras: [],
      numFrames: 61,
      randomSeed: true,
      makePrimaryVariant: true,
    },
    onChange: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    startImageUrl: undefined,
    endImageUrl: undefined,
    selectedModel: 'wan-2.2',
    onSelectedModelChange: vi.fn(),
    showHeader: false,
    ...overrides,
  };
}

describe('SegmentSettingsForm', () => {
  it('renders the travel model selector and LTX variant pills when selected', () => {
    const { rerender } = render(
      <SegmentSettingsForm {...createProps()} />,
    );

    expect(screen.getByRole('button', { name: 'WAN / VACE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'LTX 2.3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Full' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Distilled' })).not.toBeInTheDocument();

    rerender(
      <SegmentSettingsForm
        {...createProps({
          settings: {
            ...createProps().settings,
            selectedModel: 'ltx-2.3-fast',
          },
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Full' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Distilled' })).toBeInTheDocument();
  });

  it('shows the full-LTX guidance warning when structure guidance exists', () => {
    render(
      <SegmentSettingsForm
        {...createProps({
          settings: {
            ...createProps().settings,
            selectedModel: 'ltx-2.3',
          },
          structureVideoType: 'flow',
        })}
      />,
    );

    expect(
      screen.getByText(/Full LTX currently supports unguided travel only/i),
    ).toBeInTheDocument();
  });
});
