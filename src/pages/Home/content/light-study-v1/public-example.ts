import { createPublicAstridExampleBundle } from '../../publicAstridExample.tsx';
import type { ScriptedReplayScript } from '../../replay/scriptedReplay.ts';
import { LIGHT_STUDY_LOGICAL_IDS } from './logical-ids.ts';
import { LIGHT_STUDY_MEDIA } from './media.ts';
import { LIGHT_STUDY_PROVIDER_BINDING } from './provider-binding.ts';
import { LIGHT_STUDY_REGISTRY, LIGHT_STUDY_TIMELINE } from './timeline.ts';
import { LIGHT_STUDY_VERIFIED_RESULT } from './verified-result.ts';
import { LIGHT_STUDY_METADATA } from './metadata.ts';
import { LIGHT_STUDY_SCRIPT } from './authored-script.ts';

const steps: ScriptedReplayScript['steps'] = LIGHT_STUDY_SCRIPT.steps.map((step) => ({
  id: step.id,
  title: step.title,
  detail: step.detail,
  ...('assetIds' in step ? { asset_ids: step.assetIds } : {}),
  ...('clipIds' in step ? { clip_ids: step.clipIds } : {}),
  ...('resultLogicalKey' in step ? { result_logical_key: step.resultLogicalKey } : {}),
  ...('revealCondition' in step ? { reveal_condition: step.revealCondition } : {}),
}));

const script: ScriptedReplayScript = Object.freeze({
  fixture_version: LIGHT_STUDY_SCRIPT.fixtureVersion,
  label: LIGHT_STUDY_SCRIPT.label,
  logical_key: LIGHT_STUDY_SCRIPT.logicalKey,
  result_logical_key: LIGHT_STUDY_LOGICAL_IDS.result,
  request: LIGHT_STUDY_SCRIPT.request,
  response: LIGHT_STUDY_SCRIPT.response,
  steps,
});

const silentVideoWaveformAssetHashes = Object.freeze(Object.fromEntries(
  Object.entries(LIGHT_STUDY_MEDIA).map(([assetId, asset]) => [assetId, asset.sha256]),
));

/** The sample-specific data package; presentation and editor wrappers use the shared bundle contract. */
export const LIGHT_STUDY_PUBLIC_EXAMPLE = createPublicAstridExampleBundle({
  metadata: LIGHT_STUDY_METADATA,
  timelineId: LIGHT_STUDY_LOGICAL_IDS.publicTimeline,
  timeline: LIGHT_STUDY_TIMELINE,
  assetRegistry: LIGHT_STUDY_REGISTRY,
  script,
  providerBinding: LIGHT_STUDY_PROVIDER_BINDING,
  verifiedResult: LIGHT_STUDY_VERIFIED_RESULT,
  resultTarget: null,
  silentVideoWaveformAssetHashes,
});
