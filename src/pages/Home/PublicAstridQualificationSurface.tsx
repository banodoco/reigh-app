import { useMemo } from 'react';
import type { ComponentType } from 'react';
import { Player } from '@remotion/player';
import { TimelineRenderer } from '@/tools/video-editor/compositions/TimelineRenderer.tsx';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { PUBLIC_ASTRID_ELEMENT_HOST } from './astrid-public-host.tsx';

const PublicTimelineRendererForPlayer = TimelineRenderer as unknown as ComponentType<Record<string, unknown>>;

export function PublicAstridQualificationSurface() {
  const config = useMemo<ResolvedTimelineConfig>(() => {
    const descriptor = PUBLIC_ASTRID_ELEMENT_HOST.descriptors.find((item) => (
      item.kind === 'effect' && item.id === 'frame-overlay'
    ));
    if (!descriptor) throw new Error('public frame-overlay descriptor is unavailable');
    return {
      output: {resolution: '1280x720', fps: 30, file: 'astrid-public-preview.mp4'},
      tracks: [{id: 'V1', kind: 'visual', label: 'Public preview'}],
      clips: [{
        id: 'public-frame-overlay',
        clipType: 'frame-overlay',
        track: 'V1',
        at: 0,
        hold: 3,
        params: {},
        elementRef: {
          id: descriptor.id,
          kind: descriptor.kind,
          packId: descriptor.packId,
          revision: descriptor.revision,
        },
      }],
      registry: {},
    };
  }, []);

  return (
    <section aria-label="Astrid public editor preview" data-astrid-public-host="astrid-public-v1">
      <Player
        component={PublicTimelineRendererForPlayer}
        inputProps={{config, astridElementHost: PUBLIC_ASTRID_ELEMENT_HOST}}
        durationInFrames={90}
        compositionWidth={1280}
        compositionHeight={720}
        fps={30}
        controls
        style={{width: '100%', aspectRatio: '16 / 9'}}
      />
    </section>
  );
}
