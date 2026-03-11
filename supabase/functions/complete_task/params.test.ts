import { describe, expect, it } from 'vitest';
import { extractOrchestratorRef } from '../_shared/billing.ts';
import {
  buildGenerationParams,
  extractBasedOn,
  extractShotAndPosition,
  getContentType,
  setThumbnailInParams,
} from './params.ts';
import { extractRunIdParam } from '../../../src/shared/lib/tasks/taskParamContract.ts';

describe('complete_task params helpers', () => {
  it('extracts orchestrator identifiers from nested params', () => {
    expect(
      extractOrchestratorRef({
        orchestrator_details: { orchestrator_task_id: 'orch-1' },
      })
    ).toBe('orch-1');

    expect(
      extractRunIdParam({
        originalParams: { orchestrator_details: { run_id: 'run-9' } },
      })
    ).toBe('run-9');
  });

  it('extracts based_on and shot position details from multiple param shapes', () => {
    expect(
      extractBasedOn({
        originalParams: { orchestrator_details: { based_on: 'gen-1' } },
      })
    ).toBe('gen-1');

    expect(
      extractShotAndPosition({
        originalParams: {
          orchestrator_details: {
            shot_id: 'shot-77',
            add_in_position: true,
          },
        },
      })
    ).toEqual({
      shotId: 'shot-77',
      addInPosition: true,
    });
  });

  it('does not coerce non-string shot ids from malformed payloads', () => {
    expect(
      extractShotAndPosition({
        shot_id: 1234,
        add_in_position: '1',
      }),
    ).toEqual({
      shotId: undefined,
      addInPosition: true,
    });
  });

  it('sets thumbnail URL based on task type config without mutating input', () => {
    const input = { full_orchestrator_payload: { existing: true } };
    const updated = setThumbnailInParams(input, 'travel_stitch', 'https://thumb.test/file.webp');

    expect(input).toEqual({ full_orchestrator_payload: { existing: true } });
    expect(updated.full_orchestrator_payload).toEqual({
      existing: true,
      thumbnail_url: 'https://thumb.test/file.webp',
      accelerated: false,
    });
  });

  it('maps file extensions to content type', () => {
    expect(getContentType('photo.png')).toBe('image/png');
    expect(getContentType('clip.mov')).toBe('video/quicktime');
    expect(getContentType('unknown.bin')).toBe('application/octet-stream');
  });

  it('builds generation params with optional fields', () => {
    const result = buildGenerationParams(
      { base: true },
      'wan',
      'video/mp4',
      'shot-1',
      'https://thumb.test/t.png',
      'task-1'
    ) as Record<string, unknown>;

    expect(result).toMatchObject({
      base: true,
      tool_type: 'wan',
      content_type: 'video/mp4',
      shotId: 'shot-1',
      thumbnailUrl: 'https://thumb.test/t.png',
      source_task_id: 'task-1',
    });
  });
});
