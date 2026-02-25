import { describe, expect, it } from 'vitest';
import {
  resolveShotImagesEditorProps,
  type ShotImagesEditorProps,
} from './types';

function createBaseProps(): ShotImagesEditorProps {
  return {
    displayOptions: {
      isModeReady: true,
      isMobile: false,
      generationMode: 'timeline',
      onGenerationModeChange: () => {},
      columns: 3,
      skeleton: null,
    },
    imageState: {
      selectedShotId: 'shot-1',
      batchVideoFrames: 49,
      pendingPositions: new Map(),
      unpositionedGenerationsCount: 0,
      fileInputKey: 0,
      isUploadingImage: false,
    },
    editActions: {
      onImageReorder: () => {},
      onFramePositionsChange: () => {},
      onFileDrop: async () => {},
      onPendingPositionApplied: () => {},
      onImageDelete: () => {},
      onOpenUnpositionedPane: () => {},
      onImageUpload: async () => {},
    },
    shotWorkflow: {},
  };
}

describe('resolveShotImagesEditorProps', () => {
  it('merges disjoint prop groups into one resolved object', () => {
    const props = createBaseProps();
    const resolved = resolveShotImagesEditorProps(props);

    expect(resolved.isModeReady).toBe(true);
    expect(resolved.selectedShotId).toBe('shot-1');
    expect(typeof resolved.onImageUpload).toBe('function');
    expect(typeof resolved.onGenerationModeChange).toBe('function');
  });

  it('throws when a key appears in multiple groups', () => {
    const props = createBaseProps() as unknown as {
      displayOptions: Record<string, unknown>;
      imageState: Record<string, unknown>;
      editActions: Record<string, unknown>;
      shotWorkflow: Record<string, unknown>;
    };
    props.imageState.isModeReady = false;

    expect(() => resolveShotImagesEditorProps(props as unknown as ShotImagesEditorProps)).toThrow(
      /ShotImagesEditor prop key collision/,
    );
  });
});
