import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StructureVideoSection } from '../StructureVideoSection';
import type { SegmentSettings } from '../../types';

vi.mock('@/features/resources/components/ResourceBrowserModalBase', () => ({
  ResourceBrowserModalBase: () => null,
}));

vi.mock('../FieldDefaultControls', () => ({
  FieldDefaultControls: () => <div data-testid="field-default-controls" />,
}));

vi.mock('../StructureVideoPreview', () => ({
  StructureVideoPreview: () => <div data-testid="structure-video-preview" />,
}));

vi.mock('../VideoPreviewSkeleton', () => ({
  VideoPreviewSkeleton: ({ message }: { message: string }) => <div>{message}</div>,
}));

function createSettings(overrides: Partial<SegmentSettings> = {}): SegmentSettings {
  return {
    prompt: 'Prompt',
    negativePrompt: '',
    motionMode: 'basic',
    amountOfMotion: 50,
    selectedPhasePresetId: null,
    loras: [],
    numFrames: 61,
    randomSeed: true,
    makePrimaryVariant: true,
    ...overrides,
  };
}

function createVideoUploadState() {
  return {
    isUploadingVideo: false,
    uploadProgress: 0,
    pendingVideoUrl: null,
    showVideoBrowser: false,
    setShowVideoBrowser: vi.fn(),
    handleFileSelect: vi.fn(),
    handleVideoResourceSelect: vi.fn(),
    handleVideoPreviewLoaded: vi.fn(),
    clearPendingVideo: vi.fn(),
    fileInputRef: { current: null },
    addFileInputRef: { current: null },
    isVideoLoading: false,
  };
}

describe('StructureVideoSection', () => {
  it('shows the model selector even when no structure video is present', () => {
    render(
      <StructureVideoSection
        settings={createSettings()}
        onChange={vi.fn()}
        shotDefaults={{ selectedModel: 'wan-2.2' }}
        hasOverride={undefined}
        isTimelineMode={false}
        videoUpload={createVideoUploadState()}
        isDraggingVideo={false}
        onDragOver={vi.fn()}
        onDragEnter={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        handleSaveFieldAsDefault={vi.fn()}
        savingField={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'WAN / VACE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'LTX 2.3' })).toBeInTheDocument();
    expect(screen.queryByText('Guidance Mode')).not.toBeInTheDocument();
  });

  it('updates the selected model from the shared editor without requiring a structure video', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <StructureVideoSection
        settings={createSettings()}
        onChange={onChange}
        shotDefaults={{ selectedModel: 'wan-2.2' }}
        hasOverride={undefined}
        isTimelineMode={false}
        videoUpload={createVideoUploadState()}
        isDraggingVideo={false}
        onDragOver={vi.fn()}
        onDragEnter={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        handleSaveFieldAsDefault={vi.fn()}
        savingField={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'LTX 2.3' }));

    expect(onChange).toHaveBeenCalledWith({ selectedModel: 'ltx-2.3' });
  });
});
