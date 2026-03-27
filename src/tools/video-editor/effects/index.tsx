import type { FC, ReactNode } from 'react';
import { secondsToFrames } from '@/tools/video-editor/lib/config-utils';
import { DynamicEffectRegistry } from '@/tools/video-editor/effects/DynamicEffectRegistry';
import {
  BounceEntrance,
  FadeEntrance,
  FlipEntrance,
  MeteoriteEntrance,
  PulseEntrance,
  SlideDownEntrance,
  SlideLeftEntrance,
  SlideRightEntrance,
  SlideUpEntrance,
  ZoomInEntrance,
  ZoomSpinEntrance,
  type EffectComponentProps,
} from '@/tools/video-editor/effects/entrances';
import {
  DriftEffect,
  FloatEffect,
  GlitchEffect,
  KenBurnsEffect,
  SlowZoomEffect,
} from '@/tools/video-editor/effects/continuous';
import {
  DissolveExit,
  FadeOutExit,
  FlipExit,
  ShrinkExit,
  SlideDownExit,
  ZoomOutExit,
} from '@/tools/video-editor/effects/exits';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types';

export type ClipEffectComponent = FC<EffectComponentProps>;

export const entranceEffects: Record<string, ClipEffectComponent> = {
  'slide-up': SlideUpEntrance,
  'slide-down': SlideDownEntrance,
  'slide-left': SlideLeftEntrance,
  'slide-right': SlideRightEntrance,
  'zoom-in': ZoomInEntrance,
  'zoom-spin': ZoomSpinEntrance,
  pulse: PulseEntrance,
  fade: FadeEntrance,
  flip: FlipEntrance,
  bounce: BounceEntrance,
  meteorite: MeteoriteEntrance,
};

export const exitEffects: Record<string, ClipEffectComponent> = {
  'slide-down': SlideDownExit,
  'zoom-out': ZoomOutExit,
  flip: FlipExit,
  'fade-out': FadeOutExit,
  shrink: ShrinkExit,
  dissolve: DissolveExit,
};

export const continuousEffects: Record<string, ClipEffectComponent> = {
  'ken-burns': KenBurnsEffect,
  float: FloatEffect,
  glitch: GlitchEffect,
  'slow-zoom': SlowZoomEffect,
  drift: DriftEffect,
};

export const entranceEffectTypes = Object.keys(entranceEffects);
export const exitEffectTypes = Object.keys(exitEffects);
export const continuousEffectTypes = Object.keys(continuousEffects);

const allBuiltInEffects: Record<string, ClipEffectComponent> = {
  ...entranceEffects,
  ...exitEffects,
  ...continuousEffects,
};

let effectRegistry: DynamicEffectRegistry | null = null;

export function getEffectRegistry(): DynamicEffectRegistry {
  if (!effectRegistry) {
    effectRegistry = new DynamicEffectRegistry(allBuiltInEffects);
  }

  return effectRegistry;
}

export function replaceEffectRegistry(registry: DynamicEffectRegistry): DynamicEffectRegistry {
  effectRegistry = registry;
  return effectRegistry;
}

const resolveEffectName = (type: string): string => {
  return type.startsWith('custom:') ? type.slice(7) : type;
};

export const lookupEffect = (
  builtInMap: Record<string, ClipEffectComponent>,
  type: string,
): ClipEffectComponent | null => {
  const name = resolveEffectName(type);
  if (builtInMap[name]) {
    return builtInMap[name];
  }

  return getEffectRegistry().get(name) ?? null;
};

export const wrapWithClipEffects = (
  content: ReactNode,
  clip: ResolvedTimelineClip,
  durationInFrames: number,
  fps: number,
): ReactNode => {
  let wrapped = content;

  const continuous = clip.continuous ? lookupEffect(continuousEffects, clip.continuous.type) : null;
  if (continuous) {
    const Continuous = continuous;
    wrapped = (
      <Continuous
        durationInFrames={durationInFrames}
        intensity={clip.continuous?.intensity ?? 0.5}
        params={clip.continuous?.params}
      >
        {wrapped}
      </Continuous>
    );
  }

  const entrance = clip.entrance ? lookupEffect(entranceEffects, clip.entrance.type) : null;
  if (entrance) {
    const Entrance = entrance;
    wrapped = (
      <Entrance
        durationInFrames={durationInFrames}
        effectFrames={secondsToFrames(clip.entrance?.duration ?? 0.4, fps)}
        params={clip.entrance?.params}
      >
        {wrapped}
      </Entrance>
    );
  }

  const exit = clip.exit ? lookupEffect(exitEffects, clip.exit.type) : null;
  if (exit) {
    const Exit = exit;
    wrapped = (
      <Exit
        durationInFrames={durationInFrames}
        effectFrames={secondsToFrames(clip.exit?.duration ?? 0.4, fps)}
        params={clip.exit?.params}
      >
        {wrapped}
      </Exit>
    );
  }

  return wrapped;
};
