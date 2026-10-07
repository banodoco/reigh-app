import { StrictMode, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, type PlayerRef } from '@remotion/player';
import { TimelineRenderer } from '@/tools/video-editor/compositions/TimelineRenderer.tsx';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import {
  PUBLIC_ASTRID_ELEMENT_HOST,
  PUBLIC_ASTRID_ASSET_URLS,
} from '@/pages/Home/astrid-public-host.tsx';

declare global {
  interface Window {
    __ASTRID_QUALIFICATION_READY__?: boolean;
    __ASTRID_QUALIFICATION_STATE__?: {
      requestedFrame: number;
      actualPlayerFrame: number | null;
      expectedAssetUrls: Readonly<Record<string, string>>;
    };
  }
}

const search = new URLSearchParams(window.location.search);
const effect = search.get('effect') === 'end-spanning-layer' ? 'end-spanning-layer' : 'frame-overlay';
const frame = Math.max(0, Number(search.get('frame') ?? '0') || 0);

function QualificationPlayer() {
  const player = useRef<PlayerRef>(null);
  const config = useMemo<ResolvedTimelineConfig>(() => {
    const descriptor = PUBLIC_ASTRID_ELEMENT_HOST.descriptors.find((item) => item.kind === 'effect' && item.id === effect);
    if (!descriptor) throw new Error(`missing public descriptor: ${effect}`);
    const params = effect === 'end-spanning-layer'
      ? {
          phaseDurations: { prep: 1, iteration: 1, anchors: 1, workflow: 1 },
          prepSourceStart: 0.1,
          prepSourceEnd: 1,
          selectedSegmentIndex: 0,
        }
      : {};
    return {
      output: { resolution: '1920x1080', fps: 30, file: `${effect}.mp4` },
      tracks: [{ id: 'V1', kind: 'visual', label: 'Qualification' }],
      clips: [{
        id: `browser-${effect}`,
        clipType: effect,
        track: 'V1',
        at: 0,
        hold: effect === 'end-spanning-layer' ? 4 : 2,
        params,
        asset: effect === 'end-spanning-layer' ? 'managed-source' : undefined,
        assetEntry: effect === 'end-spanning-layer'
          ? { file: `${import.meta.env.BASE_URL}example-video.mp4`, src: `${import.meta.env.BASE_URL}example-video.mp4`, type: 'video/mp4' }
          : undefined,
        elementRef: { id: descriptor.id, kind: descriptor.kind, revision: descriptor.revision },
      }],
      registry: effect === 'end-spanning-layer'
        ? { 'managed-source': { file: `${import.meta.env.BASE_URL}example-video.mp4`, src: `${import.meta.env.BASE_URL}example-video.mp4`, type: 'video/mp4' } }
        : {},
    };
  }, []);

  useEffect(() => {
    player.current?.seekTo(frame);
    window.__ASTRID_QUALIFICATION_STATE__ = {
      requestedFrame: frame,
      actualPlayerFrame: player.current?.getCurrentFrame() ?? null,
      expectedAssetUrls: PUBLIC_ASTRID_ASSET_URLS,
    };
    const frameTimer = window.setInterval(() => {
      if (window.__ASTRID_QUALIFICATION_STATE__) {
        window.__ASTRID_QUALIFICATION_STATE__.actualPlayerFrame = player.current?.getCurrentFrame() ?? null;
      }
    }, 50);
    const timer = window.setTimeout(() => { window.__ASTRID_QUALIFICATION_READY__ = true; }, 750);
    return () => {
      window.clearInterval(frameTimer);
      window.clearTimeout(timer);
    };
  }, []);

  return <main data-effect={effect} data-frame={frame} data-assets={Object.keys(PUBLIC_ASTRID_ASSET_URLS).sort().join(',')}>
    <Player
      ref={player}
      component={TimelineRenderer}
      inputProps={{ config, astridElementHost: PUBLIC_ASTRID_ELEMENT_HOST }}
      durationInFrames={effect === 'end-spanning-layer' ? 120 : 60}
      compositionWidth={1920}
      compositionHeight={1080}
      fps={30}
      style={{ width: '1280px', height: '720px' }}
    />
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><QualificationPlayer /></StrictMode>);
