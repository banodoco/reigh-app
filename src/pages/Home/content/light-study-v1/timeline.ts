import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import { LIGHT_STUDY_MEDIA, resolveLightStudyAssetUrl } from './media.ts';

export const LIGHT_STUDY_TIMELINE: TimelineConfig = Object.freeze({
  output: Object.freeze({ resolution: '1280x720', fps: 30, file: 'light-study.mp4', background: '#f7f4ed' }),
  tracks: Object.freeze([{ id: 'V1', kind: 'visual', label: 'Light study' }]),
  clips: Object.freeze([
    { id: 'light-study-01', asset: 'first-light', track: 'V1', at: 0, from: 0, to: 8, label: 'First light' },
    { id: 'light-study-02', asset: 'passing-shapes', track: 'V1', at: 8, from: 0, to: 12, label: 'Passing shapes' },
    { id: 'light-study-03', asset: 'quiet-finish', track: 'V1', at: 20, from: 0, to: 8, label: 'A quiet finish' },
  ]),
}) as TimelineConfig;

export const LIGHT_STUDY_REGISTRY: AssetRegistry = Object.freeze({
  assets: Object.freeze({
    'first-light': Object.freeze({
      file: resolveLightStudyAssetUrl('first-light'), type: 'video/mp4', duration: 8,
      resolution: '1280x720', fps: 30, content_sha256: LIGHT_STUDY_MEDIA['first-light'].sha256,
      thumbnailUrl: LIGHT_STUDY_MEDIA['first-light'].thumbnailUrl, origin: 'immutable-public',
    }),
    'passing-shapes': Object.freeze({
      file: resolveLightStudyAssetUrl('passing-shapes'), type: 'video/mp4', duration: 12,
      resolution: '1280x720', fps: 30, content_sha256: LIGHT_STUDY_MEDIA['passing-shapes'].sha256,
      thumbnailUrl: LIGHT_STUDY_MEDIA['passing-shapes'].thumbnailUrl, origin: 'immutable-public',
    }),
    'quiet-finish': Object.freeze({
      file: resolveLightStudyAssetUrl('quiet-finish'), type: 'video/mp4', duration: 8,
      resolution: '1280x720', fps: 30, content_sha256: LIGHT_STUDY_MEDIA['quiet-finish'].sha256,
      thumbnailUrl: LIGHT_STUDY_MEDIA['quiet-finish'].thumbnailUrl, origin: 'immutable-public',
    }),
  }),
}) as AssetRegistry;
