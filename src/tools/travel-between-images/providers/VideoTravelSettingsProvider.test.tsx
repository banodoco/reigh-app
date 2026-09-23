import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
import {
  VideoTravelSettingsProvider,
  useFrameSettings,
  useModelSettings,
  useMotionSettings,
  useVideoTravelSettingsStatus,
} from './VideoTravelSettingsProvider';
import {
  createDefaultVideoTravelSettings,
  type VideoTravelSettings,
} from '../settings';

const { mockProviderUpdateFields } = vi.hoisted(() => ({
  mockProviderUpdateFields: vi.fn(),
}));

let mockInitialSettings: VideoTravelSettings = createDefaultVideoTravelSettings();
let mockShotSettingsOptions: { customLoadSave?: unknown; bootstrapData?: unknown } | undefined;

vi.mock('../hooks/settings/useShotSettings', async () => {
  const ReactModule = await import('react');
  return {
    useShotSettings: (_shotId: string | null | undefined, _projectId: string | null | undefined, options?: { customLoadSave?: unknown; bootstrapData?: unknown }) => {
      mockShotSettingsOptions = options;
      const [settings, setSettings] = ReactModule.useState<VideoTravelSettings>(mockInitialSettings);

      return {
        settings,
        status: 'ready' as const,
        shotId: 'shot-1',
        isDirty: false,
        error: null,
        updateField: (key: keyof VideoTravelSettings, value: VideoTravelSettings[keyof VideoTravelSettings]) => {
          setSettings((current) => ({ ...current, [key]: value }));
        },
        updateFields: (updates: Partial<VideoTravelSettings>) => {
          mockProviderUpdateFields(updates);
          setSettings((current) => ({ ...current, ...updates }));
        },
        applyShotSettings: vi.fn(),
        applyProjectDefaults: vi.fn(),
        resetToDefaults: vi.fn(),
        save: vi.fn(async () => {}),
        saveImmediate: vi.fn(async () => {}),
        revert: vi.fn(),
      };
    },
  };
});

vi.mock('../hooks/settings/useVideoTravelSettingsHandlers', () => ({
  useVideoTravelSettingsHandlers: ({ shotSettingsRef }: { shotSettingsRef: React.MutableRefObject<{
    updateField: (key: keyof VideoTravelSettings, value: VideoTravelSettings[keyof VideoTravelSettings]) => void;
    saveImmediate: () => Promise<void>;
  }> }) => {
    const updateField = shotSettingsRef.current.updateField;
    const noOp = () => {};

    return {
      handleVideoControlModeChange: noOp,
      handlePairConfigChange: noOp,
      handleBatchVideoPromptChange: noOp,
      handleNegativePromptChange: noOp,
      handleBatchVideoFramesChange: (frames: number) => updateField('batchVideoFrames', frames),
      handleBatchVideoStepsChange: (steps: number) => updateField('batchVideoSteps', steps),
      handleGuidanceScaleChange: (guidanceScale: number) => updateField('guidanceScale', guidanceScale),
      handleTextBeforePromptsChange: noOp,
      handleTextAfterPromptsChange: noOp,
      handleBlurSave: () => shotSettingsRef.current.saveImmediate(),
      handleEnhancePromptChange: noOp,
      handleTurboModeChange: (turbo: boolean) => updateField('turboMode', turbo),
      handleSmoothContinuationsChange: noOp,
      handleAmountOfMotionChange: noOp,
      handleMotionModeChange: (mode: 'basic' | 'advanced') => updateField('motionMode', mode),
      handleGenerationTypeModeChange: noOp,
      handleSteerableMotionSettingsChange: noOp,
      handleSelectedModelChange: noOp,
      handlePhaseConfigChange: noOp,
      handlePhasePresetSelect: noOp,
      handlePhasePresetRemove: noOp,
      handleRestoreDefaults: noOp,
      handleGenerationModeChange: noOp,
      handleSelectedLorasChange: noOp,
      noOpCallback: noOp,
    };
  },
}));

function Consumer() {
  const frameSettings = useFrameSettings();
  const modelSettings = useModelSettings();
  const motionSettings = useMotionSettings();
  const settingsStatus = useVideoTravelSettingsStatus();

  return (
    <div>
      <div data-testid="selected-model">{modelSettings.selectedModel}</div>
      <div data-testid="frames">{frameSettings.batchVideoFrames}</div>
      <div data-testid="steps">{frameSettings.batchVideoSteps}</div>
      <div data-testid="guidance">{modelSettings.guidanceScale ?? 'none'}</div>
      <div data-testid="turbo">{String(motionSettings.turboMode)}</div>
      <div data-testid="canonical-persistence">{String(settingsStatus.canonicalPersistence)}</div>
      <button type="button" onClick={() => frameSettings.setFrames(49)}>set-frames-49</button>
      <button type="button" onClick={() => frameSettings.setSteps(20)}>set-steps-20</button>
      <button type="button" onClick={() => modelSettings.setGuidanceScale(5)}>set-guidance-5</button>
      <button type="button" onClick={() => modelSettings.setSelectedModel('ltx-2.3')}>switch-ltx</button>
      <button type="button" onClick={() => modelSettings.setSelectedModel('wan-2.2')}>switch-wan</button>
    </div>
  );
}

describe('VideoTravelSettingsProvider', () => {
  beforeEach(() => {
    mockProviderUpdateFields.mockClear();
    mockShotSettingsOptions = undefined;
    mockInitialSettings = {
      ...createDefaultVideoTravelSettings(),
      selectedModel: 'wan-2.2',
      turboMode: true,
      motionMode: 'advanced',
      advancedMode: true,
    };
  });

  it('does not bootstrap canonical settings from a stale selected-shot snapshot', () => {
    const customPersistence = {
      entityId: 'shot-1',
      domainKey: 'canonical-shot-settings:test',
      load: async () => null,
      save: async () => {},
    };
    renderWithClient(
      <VideoTravelSettingsProvider
        projectId="project-1"
        shotId="shot-1"
        selectedShot={{ settings: { travel_between_images: { selectedModel: 'wan-2.2' } } } as never}
        availableLoras={[]}
        updateShotMode={vi.fn()}
        shotSettingsPersistence={customPersistence}
      >
        <Consumer />
      </VideoTravelSettingsProvider>,
    );

    expect(mockShotSettingsOptions?.customLoadSave).toBe(customPersistence);
    expect(mockShotSettingsOptions?.bootstrapData).toBeUndefined();
    expect(screen.getByTestId('canonical-persistence')).toHaveTextContent('true');
  });

  it('does not normalize and publish canonical settings during popup mount', () => {
    mockInitialSettings = {
      ...createDefaultVideoTravelSettings(),
      batchVideoFrames: 9999,
    };
    const customPersistence = {
      entityId: 'shot-1',
      domainKey: 'canonical-settings-mount-noop',
      load: async () => null,
      save: vi.fn(async () => {}),
    };

    renderWithClient(
      <VideoTravelSettingsProvider
        projectId="project-1"
        shotId="shot-1"
        selectedShot={null}
        availableLoras={[]}
        updateShotMode={vi.fn()}
        shotSettingsPersistence={customPersistence}
      >
        <Consumer />
      </VideoTravelSettingsProvider>,
    );

    expect(mockProviderUpdateFields).not.toHaveBeenCalled();
    expect(customPersistence.save).not.toHaveBeenCalled();
    expect(screen.getByTestId('canonical-persistence')).toHaveTextContent('true');
  });

  it('stores and restores per-model substate while clearing LTX-incompatible toggles', () => {
    renderWithClient(
      <VideoTravelSettingsProvider
        projectId="project-1"
        shotId="shot-1"
        selectedShot={null}
        availableLoras={[]}
        updateShotMode={vi.fn()}
      >
        <Consumer />
      </VideoTravelSettingsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-frames-49' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-steps-20' }));
    fireEvent.click(screen.getByRole('button', { name: 'switch-ltx' }));

    expect(screen.getByTestId('selected-model')).toHaveTextContent('ltx-2.3');
    expect(screen.getByTestId('frames')).toHaveTextContent('97');
    expect(screen.getByTestId('steps')).toHaveTextContent('30');
    expect(screen.getByTestId('guidance')).toHaveTextContent('3');
    expect(screen.getByTestId('turbo')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'set-frames-49' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-steps-20' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-guidance-5' }));
    fireEvent.click(screen.getByRole('button', { name: 'switch-wan' }));

    expect(screen.getByTestId('selected-model')).toHaveTextContent('wan-2.2');
    expect(screen.getByTestId('frames')).toHaveTextContent('49');
    expect(screen.getByTestId('steps')).toHaveTextContent('20');
    expect(screen.getByTestId('guidance')).toHaveTextContent('none');

    fireEvent.click(screen.getByRole('button', { name: 'switch-ltx' }));

    expect(screen.getByTestId('selected-model')).toHaveTextContent('ltx-2.3');
    expect(screen.getByTestId('frames')).toHaveTextContent('49');
    expect(screen.getByTestId('steps')).toHaveTextContent('20');
    expect(screen.getByTestId('guidance')).toHaveTextContent('5');
  });

  it('keeps canonical persistence disabled for the normal modal provider', () => {
    renderWithClient(
      <VideoTravelSettingsProvider
        projectId="project-1"
        shotId="shot-1"
        selectedShot={null}
        availableLoras={[]}
        updateShotMode={vi.fn()}
      >
        <Consumer />
      </VideoTravelSettingsProvider>,
    );

    expect(screen.getByTestId('canonical-persistence')).toHaveTextContent('false');
  });

  it('coerces invalid persisted selectedModel values before switching models', () => {
    mockInitialSettings = {
      ...createDefaultVideoTravelSettings(),
      selectedModel: 'wan-2.1' as never,
      modelSettingsByModel: undefined,
    };

    renderWithClient(
      <VideoTravelSettingsProvider
        projectId="project-1"
        shotId="shot-1"
        selectedShot={null}
        availableLoras={[]}
        updateShotMode={vi.fn()}
      >
        <Consumer />
      </VideoTravelSettingsProvider>,
    );

    expect(screen.getByTestId('selected-model')).toHaveTextContent('wan-2.2');

    fireEvent.click(screen.getByRole('button', { name: 'switch-ltx' }));

    expect(screen.getByTestId('selected-model')).toHaveTextContent('ltx-2.3');
    expect(screen.getByTestId('guidance')).toHaveTextContent('3');
  });

  it('clamps restored per-model frame state to the active continuation policy', () => {
    mockInitialSettings = {
      ...createDefaultVideoTravelSettings(),
      selectedModel: 'wan-2.2',
      generationTypeMode: 'vace',
      smoothContinuations: true,
      batchVideoFrames: 77,
      modelSettingsByModel: {
        ...createDefaultVideoTravelSettings().modelSettingsByModel,
        'wan-2.2': {
          batchVideoFrames: 77,
          batchVideoSteps: 6,
        },
        'ltx-2.3': {
          batchVideoFrames: 97,
          batchVideoSteps: 30,
          guidanceScale: 3,
        },
      },
    };

    renderWithClient(
      <VideoTravelSettingsProvider
        projectId="project-1"
        shotId="shot-1"
        selectedShot={null}
        availableLoras={[]}
        updateShotMode={vi.fn()}
      >
        <Consumer />
      </VideoTravelSettingsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'switch-ltx' }));

    expect(screen.getByTestId('selected-model')).toHaveTextContent('ltx-2.3');
    expect(screen.getByTestId('frames')).toHaveTextContent('97');
  });
});
