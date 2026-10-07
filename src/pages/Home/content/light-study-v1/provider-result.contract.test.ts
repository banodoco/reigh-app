import { describe, expect, it } from 'vitest';
import { LIGHT_STUDY_LOGICAL_IDS } from './logical-ids.ts';
import { LIGHT_STUDY_SCRIPT } from './authored-script.ts';
import { LIGHT_STUDY_PROVIDER_BINDING } from './provider-binding.ts';
import { LIGHT_STUDY_VERIFIED_RESULT } from './verified-result.ts';
import {
  createInitialScriptedReplayState,
  deriveScriptedReplayPresentation,
  type ScriptedReplayScript,
} from '../../replay/scriptedReplay.ts';

describe('Light study provider and result contracts', () => {
  it('keeps real provider and render records explicitly unbound and unavailable', () => {
    expect(LIGHT_STUDY_PROVIDER_BINDING).toEqual({
      state: 'unbound',
      provider: null,
      projectId: null,
      projectSlug: null,
      timelineId: null,
      timelineVersion: null,
      readbackReceiptSha256: null,
    });
    expect(LIGHT_STUDY_VERIFIED_RESULT).toEqual({
      state: 'unavailable',
      exportSource: null,
      target: null,
      taskId: null,
      outputObjectId: null,
      outputFilename: null,
      outputSha256: null,
      durationSeconds: null,
      frameCount: null,
      verificationReceiptSha256: null,
    });
  });

  it('uses canonical fixture, asset, clip and result IDs across authored script and replay', () => {
    const [media, sequence, timing, result] = LIGHT_STUDY_SCRIPT.steps;
    const replayScript: ScriptedReplayScript = {
      fixture_version: LIGHT_STUDY_SCRIPT.fixtureVersion,
      label: LIGHT_STUDY_SCRIPT.label,
      logical_key: LIGHT_STUDY_SCRIPT.logicalKey,
      result_logical_key: LIGHT_STUDY_LOGICAL_IDS.result,
      request: LIGHT_STUDY_SCRIPT.request,
      response: LIGHT_STUDY_SCRIPT.response,
      steps: LIGHT_STUDY_SCRIPT.steps.map((step) => ({
        id: step.id,
        title: step.title,
        detail: step.detail,
        ...('assetIds' in step ? { asset_ids: step.assetIds } : {}),
        ...('clipIds' in step ? { clip_ids: step.clipIds } : {}),
        ...('resultLogicalKey' in step ? { result_logical_key: step.resultLogicalKey } : {}),
        ...('revealCondition' in step ? { reveal_condition: step.revealCondition } : {}),
      })),
    };
    const presentation = deriveScriptedReplayPresentation(replayScript, createInitialScriptedReplayState());

    expect(LIGHT_STUDY_SCRIPT.fixtureVersion).toBe(LIGHT_STUDY_LOGICAL_IDS.fixture);
    expect(LIGHT_STUDY_SCRIPT.logicalKey).toBe(LIGHT_STUDY_LOGICAL_IDS.script);
    expect('assetIds' in media ? media.assetIds : []).toEqual(Object.values(LIGHT_STUDY_LOGICAL_IDS.assets));
    expect('clipIds' in sequence ? sequence.clipIds : []).toEqual(Object.values(LIGHT_STUDY_LOGICAL_IDS.clips));
    expect('clipIds' in timing ? timing.clipIds : []).toEqual(Object.values(LIGHT_STUDY_LOGICAL_IDS.clips));
    expect('resultLogicalKey' in result ? result.resultLogicalKey : null).toBe(LIGHT_STUDY_LOGICAL_IDS.result);
    expect(presentation.result.logicalKey).toBe(LIGHT_STUDY_LOGICAL_IDS.result);
    expect(presentation.result.availability).toBe('unavailable');
  });
});
