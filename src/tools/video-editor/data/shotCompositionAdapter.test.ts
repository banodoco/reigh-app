import { describe, expect, it, vi } from 'vitest';

import fixture from './shotComposition.fixture.json';
import {
  createShotCompositionAdapter,
  ShotCompositionUnavailableError,
} from './shotCompositionAdapter.ts';
import { StaleWriteError } from './shotComposition.ts';

describe('shot-composition product adapter', () => {
  it('keeps linked occurrences distinct while sharing their pinned revision', async () => {
    const port = { load: vi.fn().mockResolvedValue(fixture) };
    const composition = await createShotCompositionAdapter(port).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });

    expect(composition.occurrences[0]?.occurrenceId).not.toBe(composition.occurrences[1]?.occurrenceId);
    expect(composition.occurrences[0]?.revisionId).toBe(composition.occurrences[1]?.revisionId);
    expect(composition.occurrences[0]?.revision).toBe(composition.occurrences[1]?.revision);
    expect(composition.occurrences[4]?.shotId).toBe('shot-alpha-copy');
    expect(composition.occurrences[4]?.revision).not.toBe(composition.occurrences[0]?.revision);
    expect(port.load).toHaveBeenCalledWith({ projectId: 'project-001', parentDocumentId: 'document-primary' });
  });

  it('allows the editor host and Travel Between Images to share one injected port', async () => {
    const port = { load: vi.fn().mockResolvedValue(fixture) };
    const editorAdapter = createShotCompositionAdapter(port);
    const travelAdapter = createShotCompositionAdapter(port);
    await Promise.all([
      editorAdapter.load({ projectId: 'project-001', parentDocumentId: 'document-primary' }),
      travelAdapter.load({ projectId: 'project-001', parentDocumentId: 'document-primary' }),
    ]);
    expect(port.load).toHaveBeenCalledTimes(2);
    expect(editorAdapter.prepare(fixture).occurrences[0]?.occurrenceId)
      .toBe(travelAdapter.prepare(fixture).occurrences[0]?.occurrenceId);
  });

  it('publishes with an explicit expected head and maps Runtime 409 to StaleWriteError', async () => {
    const publish = vi.fn().mockRejectedValue(Object.assign(new Error('head moved'), { status: 409 }));
    const adapter = createShotCompositionAdapter({ load: vi.fn(), publish });

    await expect(adapter.publish({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
      expectedHeadRevisionId: 'timeline-rev-2',
      graph: fixture,
    })).rejects.toMatchObject({ status: 409, code: 'stale_write' });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      expectedHeadRevisionId: 'timeline-rev-2',
      graph: fixture,
    }));
  });

  it('reports a typed read-only failure when the provider has no publish port', async () => {
    const adapter = createShotCompositionAdapter({ load: vi.fn() });
    await expect(adapter.publish({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
      expectedHeadRevisionId: 'timeline-rev-2',
      graph: fixture,
    })).rejects.toBeInstanceOf(ShotCompositionUnavailableError);
  });
});
