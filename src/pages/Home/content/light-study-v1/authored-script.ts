import { LIGHT_STUDY_LOGICAL_IDS } from './logical-ids.ts';

export const LIGHT_STUDY_SCRIPT = Object.freeze({
  fixtureVersion: LIGHT_STUDY_LOGICAL_IDS.fixture,
  logicalKey: LIGHT_STUDY_LOGICAL_IDS.script,
  label: 'Scripted example',
  request: 'Arrange these three light studies into a quiet 28-second sequence. Keep the middle scene longer and let the final frame settle.',
  response: 'The example uses an 8-second opening, a 12-second middle scene and an 8-second finish. The last frame holds for two seconds.',
  presentationRules: Object.freeze([
    'Keep Scripted example visible inside chat.',
    'Keep Placeholder media visible on App-first/direct entry.',
    'Do not claim live generation, named integrations, tool invocations, or generated status.',
    'Do not autoplay when revealing the result.',
    'Replay presentation timing must not reset or drive the editor playhead.',
  ]),
  steps: Object.freeze([
    Object.freeze({ id: 'source-media', title: 'Source media', detail: 'Three locally authored clips.', assetIds: Object.freeze([
      LIGHT_STUDY_LOGICAL_IDS.assets.firstLight,
      LIGHT_STUDY_LOGICAL_IDS.assets.passingShapes,
      LIGHT_STUDY_LOGICAL_IDS.assets.quietFinish,
    ]) }),
    Object.freeze({ id: 'sequence', title: 'Sequence', detail: 'Arrange the clips and set their durations.', clipIds: Object.freeze([
      LIGHT_STUDY_LOGICAL_IDS.clips.firstLight,
      LIGHT_STUDY_LOGICAL_IDS.clips.passingShapes,
      LIGHT_STUDY_LOGICAL_IDS.clips.quietFinish,
    ]) }),
    Object.freeze({ id: 'timing', title: 'Timing', detail: 'Keep the movement gentle and leave a quiet ending.', clipIds: Object.freeze([
      LIGHT_STUDY_LOGICAL_IDS.clips.firstLight,
      LIGHT_STUDY_LOGICAL_IDS.clips.passingShapes,
      LIGHT_STUDY_LOGICAL_IDS.clips.quietFinish,
    ]) }),
    Object.freeze({ id: 'result', title: 'Result', detail: 'Open the prepared Light study project.', resultLogicalKey: LIGHT_STUDY_LOGICAL_IDS.result, revealCondition: 'a real, schema-backed project and verified export exist' }),
  ]),
});
