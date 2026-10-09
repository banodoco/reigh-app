// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementsLibraryPanel } from './ElementsLibraryPanel.tsx';

const harness = vi.hoisted(() => ({
  editorContext: null as unknown,
  selectedClipIds: ['source-clip'],
  execute: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: harness.invalidateQueries }),
}));

vi.mock('@/shared/contexts/AgentChatContext', () => ({
  useAgentChatBridge: () => ({ editorContext: harness.editorContext }),
}));

vi.mock('@/tools/video-editor/hooks/timelineStore', () => ({
  useTimelineEditorData: () => ({ selectedClipIds: harness.selectedClipIds }),
}));

const elementEntry = {
  id: 'end-spanning-layer',
  packId: 'local',
  label: 'Ending Spanning Layer',
  kind: 'effect' as const,
  placement: 'overlay' as const,
  revision: 'sha256:a91d9377',
  capabilities: {
    browserPreview: 'supported' as const,
    astridExport: 'supported' as const,
    workerExport: 'supported' as const,
  },
  publication: 'published' as const,
};

const transitionEntry = {
  ...elementEntry,
  id: 'crossfade',
  packId: 'rendering',
  label: 'Crossfade',
  kind: 'transition' as const,
  placement: 'between-clips' as const,
};

function renderPanel(catalog: readonly unknown[], selectedClipIds = ['source-clip']) {
  harness.selectedClipIds = selectedClipIds;
  harness.editorContext = {
    projectSlug: 'pack-coherence-browser-proof',
    timelineId: 'main',
    timelineSummary: { configVersion: 7, trackCount: 2, clipCount: 1, assetCount: 1, duration: 2 },
    elementContext: { catalog },
    elementOperationAdapter: { execute: harness.execute },
  };
  render(
    <ElementsLibraryPanel
      open
      onOpenChange={vi.fn()}
      onOpenCreationPrompt={vi.fn()}
    />,
  );
}

describe('ElementsLibraryPanel owner-pinned operations', () => {
  beforeEach(() => {
    harness.execute.mockReset().mockResolvedValue({ config_version: 8 });
    harness.invalidateQueries.mockReset();
  });

  it('persists the owning pack on an applied element reference', async () => {
    renderPanel([elementEntry]);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(harness.execute).toHaveBeenCalledWith(expect.objectContaining({
      name: 'timeline.apply_element',
      element: {
        id: 'end-spanning-layer',
        kind: 'effect',
        revision: 'sha256:a91d9377',
        packId: 'local',
      },
    })));
  });

  it('persists the owning pack on an applied transition reference', async () => {
    renderPanel([transitionEntry], ['source-clip', 'next-clip']);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(harness.execute).toHaveBeenCalledWith(expect.objectContaining({
      name: 'timeline.apply_transition',
      transition: {
        id: 'crossfade',
        kind: 'transition',
        revision: 'sha256:a91d9377',
        packId: 'rendering',
      },
    })));
  });
});
