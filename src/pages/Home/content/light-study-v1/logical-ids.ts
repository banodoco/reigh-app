/** Stable application identities. Provider identities stay in provider-binding.ts. */
export const LIGHT_STUDY_LOGICAL_IDS = Object.freeze({
  fixture: 'light-study-v1',
  project: 'light-study',
  timeline: 'light-study-timeline-v1',
  publicTimeline: 'astrid-light-study',
  script: 'light-study-script-v1',
  result: 'light-study-result-v1',
  assets: Object.freeze({
    firstLight: 'first-light',
    passingShapes: 'passing-shapes',
    quietFinish: 'quiet-finish',
  }),
  clips: Object.freeze({
    firstLight: 'light-study-01',
    passingShapes: 'light-study-02',
    quietFinish: 'light-study-03',
  }),
});

/**
 * The accepted C01 candidate carried UUID 9eab2d57-8457-4a0b-8f03-c8f547ed7d71.
 * It was never read back from Runtime, so it is provenance only and must never
 * be used as a persisted provider identity.
 */
export const UNPERSISTED_C01_TIMELINE_CANDIDATE_ID =
  '9eab2d57-8457-4a0b-8f03-c8f547ed7d71';
