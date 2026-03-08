import { describe, expect, it, vi, beforeEach } from 'vitest';
import { submitPreset } from './submitPreset';

const mockUploadImageToStorage = vi.fn();

vi.mock('@/shared/lib/media/imageUploader', () => ({
  uploadImageToStorage: (...args: unknown[]) => mockUploadImageToStorage(...args),
}));

function buildFields(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Preset Name',
    description: 'Preset Description',
    created_by_is_you: true,
    created_by_username: 'ignored-user',
    is_public: true,
    basePrompt: 'base prompt',
    negativePrompt: 'negative prompt',
    textBeforePrompts: 'before',
    textAfterPrompts: 'after',
    enhancePrompt: true,
    durationFrames: 72,
    ...overrides,
  };
}

function buildPhaseConfig() {
  return {
    num_phases: 2,
    steps_per_phase: [3, 4],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      { phase: 1, guidance_scale: 1, loras: [] },
      { phase: 2, guidance_scale: 1, loras: [] },
    ],
  };
}

beforeEach(() => {
  mockUploadImageToStorage.mockReset();
  mockUploadImageToStorage.mockImplementation(async (file: File) => `https://cdn.example.com/${file.name}`);
});

describe('submitPreset', () => {
  it('creates new presets with initial video + uploaded samples and calls create mutation', async () => {
    const createResource = { mutateAsync: vi.fn(async () => undefined) };
    const updateResource = { mutateAsync: vi.fn(async () => undefined) };
    const onClearEdit = vi.fn();

    await submitPreset({
      fields: buildFields(),
      editablePhaseConfig: buildPhaseConfig(),
      generationTypeMode: 'vace',
      sampleFiles: {
        sampleFiles: [
          new File(['image'], 'sample.png', { type: 'image/png' }),
          new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
        ],
        deletedExistingSampleUrls: [],
        mainGenerationIndex: 1,
        initialVideoSample: 'https://init/video.mp4',
        initialVideoDeleted: false,
      },
      isEditMode: false,
      isOverwriting: false,
      editingPreset: null,
      currentSettings: { selectedLoras: [{ id: 'l1', name: 'LoRA', strength: 0.8 }] },
      createResource: createResource as never,
      updateResource: updateResource as never,
      onClearEdit,
    });

    expect(mockUploadImageToStorage).toHaveBeenCalledTimes(2);
    expect(createResource.mutateAsync).toHaveBeenCalledTimes(1);
    expect(updateResource.mutateAsync).not.toHaveBeenCalled();
    expect(onClearEdit).not.toHaveBeenCalled();

    const payload = createResource.mutateAsync.mock.calls[0][0];
    expect(payload.type).toBe('phase-config');
    expect(payload.metadata.main_generation).toBe('https://init/video.mp4');
    expect(payload.metadata.sample_generations).toEqual([
      { url: 'https://init/video.mp4', type: 'video', alt_text: 'Latest video generation' },
      { url: 'https://cdn.example.com/sample.png', type: 'image', alt_text: 'sample.png' },
      { url: 'https://cdn.example.com/clip.mp4', type: 'video', alt_text: 'clip.mp4' },
    ]);
    expect(payload.metadata.created_by).toEqual({ is_you: true, username: undefined });
    expect(payload.metadata.use_count).toBe(0);
    expect(payload.metadata.generationTypeMode).toBe('vace');
    expect(payload.metadata.selectedLoras).toEqual([{ id: 'l1', name: 'LoRA', strength: 0.8 }]);
  });

  it('updates existing presets in edit mode, preserving existing metadata and clearing edit state', async () => {
    const createResource = { mutateAsync: vi.fn(async () => undefined) };
    const updateResource = { mutateAsync: vi.fn(async () => undefined) };
    const onClearEdit = vi.fn();

    const editingPreset = {
      id: 'preset-123',
      metadata: {
        name: 'Old Name',
        description: 'Old Description',
        created_by: { is_you: false, username: 'alice' },
        is_public: false,
        phaseConfig: buildPhaseConfig(),
        sample_generations: [
          { url: 'https://old/1.png', type: 'image', alt_text: 'one' },
          { url: 'https://old/2.png', type: 'image', alt_text: 'two' },
        ],
        main_generation: 'https://old/2.png',
        use_count: 5,
        created_at: '2025-02-03T00:00:00.000Z',
      },
    };

    await submitPreset({
      fields: buildFields({ created_by_is_you: false, created_by_username: 'alice', is_public: false }),
      editablePhaseConfig: buildPhaseConfig(),
      generationTypeMode: 'i2v',
      sampleFiles: {
        sampleFiles: [],
        deletedExistingSampleUrls: ['https://old/1.png'],
        mainGenerationIndex: 0,
        initialVideoSample: null,
        initialVideoDeleted: false,
      },
      isEditMode: true,
      isOverwriting: false,
      editingPreset: editingPreset as never,
      currentSettings: undefined,
      createResource: createResource as never,
      updateResource: updateResource as never,
      onClearEdit,
    });

    expect(createResource.mutateAsync).not.toHaveBeenCalled();
    expect(updateResource.mutateAsync).toHaveBeenCalledTimes(1);
    expect(onClearEdit).toHaveBeenCalledTimes(1);

    const payload = updateResource.mutateAsync.mock.calls[0][0];
    expect(payload.id).toBe('preset-123');
    expect(payload.type).toBe('phase-config');
    expect(payload.metadata.sample_generations).toEqual([
      { url: 'https://old/2.png', type: 'image', alt_text: 'two' },
    ]);
    expect(payload.metadata.main_generation).toBe('https://old/2.png');
    expect(payload.metadata.use_count).toBe(5);
    expect(payload.metadata.created_at).toBe('2025-02-03T00:00:00.000Z');
  });

  it('prefers initial video as main generation during overwrite mode edits', async () => {
    const createResource = { mutateAsync: vi.fn(async () => undefined) };
    const updateResource = { mutateAsync: vi.fn(async () => undefined) };

    const editingPreset = {
      id: 'preset-overwrite',
      metadata: {
        name: 'Old Name',
        description: '',
        created_by: { is_you: true },
        is_public: true,
        phaseConfig: buildPhaseConfig(),
        sample_generations: [{ url: 'https://old/kept.png', type: 'image', alt_text: 'kept' }],
        main_generation: 'https://old/kept.png',
        use_count: 1,
        created_at: '2025-03-01T00:00:00.000Z',
      },
    };

    await submitPreset({
      fields: buildFields(),
      editablePhaseConfig: buildPhaseConfig(),
      generationTypeMode: 'i2v',
      sampleFiles: {
        sampleFiles: [new File(['img'], 'fresh.png', { type: 'image/png' })],
        deletedExistingSampleUrls: [],
        mainGenerationIndex: 0,
        initialVideoSample: 'https://new/current.mp4',
        initialVideoDeleted: false,
      },
      isEditMode: true,
      isOverwriting: true,
      editingPreset: editingPreset as never,
      currentSettings: undefined,
      createResource: createResource as never,
      updateResource: updateResource as never,
      onClearEdit: vi.fn(),
    });

    const payload = updateResource.mutateAsync.mock.calls[0][0];
    expect(payload.metadata.main_generation).toBe('https://new/current.mp4');
    expect(payload.metadata.sample_generations[0]).toEqual({
      url: 'https://new/current.mp4',
      type: 'video',
      alt_text: 'Latest video generation',
    });
  });
});
