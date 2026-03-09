// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveLora, LoraModel } from '@/domains/lora/types/lora';
import { useLoraPersistence } from './loraPersistence';

const mocks = vi.hoisted(() => ({
  useToolSettings: vi.fn(),
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  useToolSettings: (...args: unknown[]) => mocks.useToolSettings(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

type PersistenceArgs = ComponentProps<typeof useLoraPersistence>[0];

function createManager(overrides: Partial<PersistenceArgs['manager']> = {}): PersistenceArgs['manager'] {
  const selectedLoras: ActiveLora[] = [];
  const selectedLorasRef = { current: selectedLoras };

  return {
    selectedLoras,
    selectedLorasRef,
    availableLoras: [],
    handleAddLora: vi.fn(),
    handleRemoveLora: vi.fn(),
    handleLoraStrengthChange: vi.fn(),
    markAsUserSet: vi.fn(),
    setHasEverSetLoras: vi.fn(),
    ...overrides,
  };
}

function createBaseArgs(overrides: Partial<PersistenceArgs> = {}): PersistenceArgs {
  return {
    projectId: 'project-1',
    shotId: 'shot-1',
    persistenceScope: 'project',
    persistenceKey: 'lora-settings',
    disableAutoLoad: true,
    enableProjectPersistence: true,
    manager: createManager(),
    ...overrides,
  };
}

describe('useLoraPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mocks.useToolSettings.mockReturnValue({
      settings: undefined,
      update: vi.fn().mockResolvedValue(undefined),
      isUpdating: false,
    });
  });

  it('saves project LoRAs and toggles save success state', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const selectedLorasRef = {
      current: [
        { id: 'lora-a', strength: 0.8 },
        { id: 'lora-b', strength: 0.5 },
      ] as ActiveLora[],
    };
    const manager = createManager({ selectedLorasRef });
    mocks.useToolSettings.mockReturnValue({
      settings: undefined,
      update,
      isUpdating: false,
    });

    const { result } = renderHook(() =>
      useLoraPersistence(createBaseArgs({ manager })),
    );

    await act(async () => {
      await result.current.handleSaveProjectLoras();
    });

    expect(update).toHaveBeenCalledWith('project', {
      loras: [
        { id: 'lora-a', strength: 0.8 },
        { id: 'lora-b', strength: 0.5 },
      ],
      hasEverSetLoras: true,
    });
    expect(manager.markAsUserSet).toHaveBeenCalledTimes(1);
    expect(result.current.saveSuccess).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.saveSuccess).toBe(false);
  });

  it('loads saved LoRAs by removing stale, adding missing, and updating strengths', async () => {
    const handleAddLora = vi.fn();
    const handleRemoveLora = vi.fn();
    const handleLoraStrengthChange = vi.fn();
    const markAsUserSet = vi.fn();

    const availableLoras = [
      { 'Model ID': 'add-lora' } as unknown as LoraModel,
    ];
    const selectedLorasRef = {
      current: [
        { id: 'remove-lora', strength: 1 },
        { id: 'keep-lora', strength: 0.2 },
      ] as ActiveLora[],
    };

    const manager = createManager({
      availableLoras,
      selectedLorasRef,
      handleAddLora,
      handleRemoveLora,
      handleLoraStrengthChange,
      markAsUserSet,
    });

    mocks.useToolSettings.mockReturnValue({
      settings: {
        loras: [
          { id: 'keep-lora', strength: 0.7 },
          { id: 'add-lora', strength: 0.4 },
        ],
        hasEverSetLoras: true,
      },
      update: vi.fn().mockResolvedValue(undefined),
      isUpdating: false,
    });

    const { result } = renderHook(() =>
      useLoraPersistence(createBaseArgs({ manager })),
    );

    await act(async () => {
      await result.current.handleLoadProjectLoras();
    });

    expect(handleRemoveLora).toHaveBeenCalledWith('remove-lora', false);
    expect(handleAddLora).toHaveBeenCalledWith(availableLoras[0], false, 0.4);
    expect(handleLoraStrengthChange).toHaveBeenCalledWith('keep-lora', 0.7);
    expect(markAsUserSet).toHaveBeenCalledTimes(1);
  });

  it('returns null header actions when project persistence is disabled', () => {
    const { result } = renderHook(() =>
      useLoraPersistence(
        createBaseArgs({
          enableProjectPersistence: false,
          persistenceScope: 'none',
        }),
      ),
    );

    expect(result.current.renderHeaderActions()).toBeNull();
  });
});
