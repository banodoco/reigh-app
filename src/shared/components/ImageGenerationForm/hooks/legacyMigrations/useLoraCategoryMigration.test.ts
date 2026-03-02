import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLoraCategoryMigration } from './useLoraCategoryMigration';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { ActiveLora } from '@/shared/types/lora';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

function makeLora(id: string): ActiveLora {
  return {
    id,
    name: `LoRA ${id}`,
    strength: 1,
    huggingface_url: `https://huggingface.co/${id}`,
  } as ActiveLora;
}

describe('useLoraCategoryMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('migrates per-model loras to per-category with qwen dedupe', async () => {
    const loraA = makeLora('a');
    const loraB = makeLora('b');
    const loraC = makeLora('c');
    const updateProjectImageSettings = vi.fn(async () => undefined);

    const projectImageSettings = {
      selectedLorasByTextModel: {
        'qwen-image': [loraA, loraB],
        'qwen-image-2512': [loraA],
        'z-image': [loraC],
      },
    };

    const { rerender } = renderHook((props) => useLoraCategoryMigration(props), {
      initialProps: {
        projectImageSettings,
        selectedProjectId: 'project-1',
        updateProjectImageSettings,
      },
    });

    await waitFor(() => {
      expect(updateProjectImageSettings).toHaveBeenCalledTimes(1);
    });

    expect(updateProjectImageSettings).toHaveBeenCalledWith('project', {
      selectedLorasByCategory: {
        qwen: [loraA, loraB],
        'z-image': [loraC],
      },
      selectedLorasByTextModel: undefined,
    });

    rerender({
      projectImageSettings,
      selectedProjectId: 'project-1',
      updateProjectImageSettings,
    });
    expect(updateProjectImageSettings).toHaveBeenCalledTimes(1);
  });

  it('skips migration when category format is already present', async () => {
    const updateProjectImageSettings = vi.fn(async () => undefined);

    renderHook(() =>
      useLoraCategoryMigration({
        projectImageSettings: {
          selectedLorasByTextModel: { 'qwen-image': [makeLora('a')] },
          selectedLorasByCategory: { qwen: [makeLora('a')], 'z-image': [] },
        },
        selectedProjectId: 'project-1',
        updateProjectImageSettings,
      }),
    );

    await waitFor(() => {
      expect(updateProjectImageSettings).not.toHaveBeenCalled();
    });
  });

  it('resets attempt state on migration failure and retries on next render', async () => {
    const error = new Error('write failed');
    const updateProjectImageSettings = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);

    const initialSettings = {
      selectedLorasByTextModel: {
        'qwen-image': [makeLora('a')],
      },
    };

    const { rerender } = renderHook((props) => useLoraCategoryMigration(props), {
      initialProps: {
        projectImageSettings: initialSettings,
        selectedProjectId: 'project-1',
        updateProjectImageSettings,
      },
    });

    await waitFor(() => {
      expect(updateProjectImageSettings).toHaveBeenCalledTimes(1);
      expect(normalizeAndPresentError).toHaveBeenCalledWith(error, {
        context: 'ImageGenerationForm.migrateLoraCategoryFormat',
        showToast: false,
      });
    });

    rerender({
      projectImageSettings: { ...initialSettings },
      selectedProjectId: 'project-1',
      updateProjectImageSettings,
    });

    await waitFor(() => {
      expect(updateProjectImageSettings).toHaveBeenCalledTimes(2);
    });
  });
});
