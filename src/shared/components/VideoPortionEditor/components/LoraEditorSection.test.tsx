// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_IDS } from '../../../lib/toolIds';
const { mockLoraManager } = vi.hoisted(() => ({
  mockLoraManager: vi.fn(),
}));

vi.mock('../../LoraManager', () => ({
  LoraManager: (props: unknown) => {
    mockLoraManager(props);
    return <div data-testid="lora-manager" />;
  },
}));

const { LoraEditorSection } = await import('./LoraEditorSection');

describe('LoraEditorSection', () => {
  beforeEach(() => {
    mockLoraManager.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('passes the expected persistence contract into LoraManager', () => {
    const loraManager = { save: vi.fn() };
    const availableLoras = [{ id: 'lora-1', name: 'A' }];

    render(
      <LoraEditorSection
        availableLoras={availableLoras as never[]}
        projectId="project-1"
        loraManager={loraManager as never}
      />,
    );

    expect(mockLoraManager).toHaveBeenCalledTimes(1);
    expect(mockLoraManager).toHaveBeenCalledWith(
      expect.objectContaining({
        availableLoras,
        projectId: 'project-1',
        persistenceScope: 'project',
        enableProjectPersistence: true,
        persistenceKey: TOOL_IDS.EDIT_VIDEO,
        externalLoraManager: loraManager,
        title: 'Additional LoRA Models (Optional)',
        addButtonText: 'Add or manage LoRAs',
      }),
    );
  });

  it('normalizes a missing project id to undefined', () => {
    render(
      <LoraEditorSection
        availableLoras={[]}
        projectId={null}
        loraManager={undefined}
      />,
    );

    expect(mockLoraManager).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: undefined,
      }),
    );
  });
});
