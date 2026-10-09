import type { ComponentType } from 'react';
import { ASTRID_RENDERING_ELEMENTS } from '@astrid-public/packs/rendering/elements/public-catalog.ts';
import FadeAnimation from '@astrid-public/packs/rendering/elements/animations/fade/component.tsx';
import FadeUpAnimation from '@astrid-public/packs/rendering/elements/animations/fade-up/component.tsx';
import ScaleInAnimation from '@astrid-public/packs/rendering/elements/animations/scale-in/component.tsx';
import SlideLeftAnimation from '@astrid-public/packs/rendering/elements/animations/slide-left/component.tsx';
import SlideUpAnimation from '@astrid-public/packs/rendering/elements/animations/slide-up/component.tsx';
import TypeOnAnimation from '@astrid-public/packs/rendering/elements/animations/type-on/component.tsx';
import AudioReactiveColour from '@astrid-public/packs/rendering/elements/effects/audio-reactive-colour/component.tsx';
import TextCard from '@astrid-public/packs/rendering/elements/effects/text-card/component.tsx';
import CrossFadeTransition from '@astrid-public/packs/rendering/elements/transitions/cross-fade/component.tsx';
import FadeTransition from '@astrid-public/packs/rendering/elements/transitions/fade/component.tsx';
import EndSpanningLayer from '@astrid-public/packs/local/elements/effects/end-spanning-layer/component.tsx';
import FrameOverlay from '@astrid-public/packs/local/elements/effects/frame-overlay/component.tsx';
import card0 from '@astrid-public/packs/local/elements/effects/end-spanning-layer/assets/card-0.png?url';
import card1 from '@astrid-public/packs/local/elements/effects/end-spanning-layer/assets/card-1.png?url';
import card2 from '@astrid-public/packs/local/elements/effects/end-spanning-layer/assets/card-2.png?url';
import card3 from '@astrid-public/packs/local/elements/effects/end-spanning-layer/assets/card-3.png?url';
import card4 from '@astrid-public/packs/local/elements/effects/end-spanning-layer/assets/card-4.png?url';
import card5 from '@astrid-public/packs/local/elements/effects/end-spanning-layer/assets/card-5.png?url';
import frame from '@astrid-public/packs/local/elements/effects/frame-overlay/assets/frame.png?url';
import { createAstridPreviewAssetWrapper } from '@/tools/video-editor/sequences/components/createAstridPreviewAssetWrapper.tsx';
import type {
  AstridDynamicSequenceEntry,
  AstridElementComponentProps,
  AstridElementDescriptor,
  AstridElementHost,
} from '@/tools/video-editor/runtime/astrid-element-host.ts';

const EndSpanningLayerPreview = createAstridPreviewAssetWrapper(
  EndSpanningLayer,
  {card0, card1, card2, card3, card4, card5},
);
const FrameOverlayPreview = createAstridPreviewAssetWrapper(FrameOverlay, {frame});

const asComponent = (value: unknown) => value as ComponentType<AstridElementComponentProps>;
const componentEntries: Array<[string, ComponentType<AstridElementComponentProps>]> = [
  ['animation:fade', asComponent(FadeAnimation)],
  ['animation:fade-up', asComponent(FadeUpAnimation)],
  ['animation:scale-in', asComponent(ScaleInAnimation)],
  ['animation:slide-left', asComponent(SlideLeftAnimation)],
  ['animation:slide-up', asComponent(SlideUpAnimation)],
  ['animation:type-on', asComponent(TypeOnAnimation)],
  ['effect:audio-reactive-colour', asComponent(AudioReactiveColour)],
  ['effect:text-card', asComponent(TextCard)],
  ['transition:cross-fade', asComponent(CrossFadeTransition)],
  ['transition:fade', asComponent(FadeTransition)],
  ['effect:end-spanning-layer', asComponent(EndSpanningLayerPreview)],
  ['effect:frame-overlay', asComponent(FrameOverlayPreview)],
];
const components = new Map(componentEntries);
const publicComponentKeys = new Set<string>();

if (ASTRID_RENDERING_ELEMENTS.length !== 12 || components.size !== 12) {
  throw new Error('Astrid public host requires exactly twelve descriptors and components');
}
for (const descriptor of ASTRID_RENDERING_ELEMENTS) {
  const componentKey = `${descriptor.kind}:${descriptor.id}`;
  if (publicComponentKeys.has(componentKey)) {
    throw new Error(`Astrid public host has more than one owner for ${componentKey}`);
  }
  publicComponentKeys.add(componentKey);
  if (!components.has(componentKey)) {
    throw new Error(`Astrid public host is missing ${descriptor.kind}:${descriptor.id}`);
  }
}
if (publicComponentKeys.size !== components.size) {
  throw new Error('Astrid public host component map and descriptor catalog do not match');
}

const sequenceRegistry = Object.freeze({
  'end-spanning-layer': {component: EndSpanningLayerPreview, themeId: '2rp', source: 'public:astrid'},
  'frame-overlay': {component: FrameOverlayPreview, themeId: '2rp', source: 'public:astrid'},
});

function resolvePublicSequenceEntry(
  clipType: string | undefined,
  dynamicEntries: readonly AstridDynamicSequenceEntry[],
): AstridDynamicSequenceEntry | undefined {
  if (!clipType) return undefined;
  const normalized = clipType.startsWith('custom:') ? clipType.slice('custom:'.length) : clipType;
  const dynamic = dynamicEntries.find((entry) => entry.clipType === normalized);
  if (dynamic && (clipType.startsWith('custom:') || !(normalized in sequenceRegistry))) return dynamic;
  return undefined;
}

const publicAstridElementHost: AstridElementHost = {
  descriptors: ASTRID_RENDERING_ELEMENTS,
  sequenceRegistry,
  resolveComponent(elementId, kind, packId) {
    const descriptor = ASTRID_RENDERING_ELEMENTS.find((item: AstridElementDescriptor) => (
      item.id === elementId
      && item.kind === kind
      && (packId === undefined || item.packId === packId)
    ));
    if (!descriptor) return undefined;
    return components.get(`${kind}:${elementId}`);
  },
  resolveSequenceClipEntry: resolvePublicSequenceEntry,
  describeClipCapability(clip, dynamicEntries) {
    const dynamic = resolvePublicSequenceEntry(clip?.clipType, dynamicEntries);
    if (dynamic) {
      return {
        clipType: dynamic.clipType,
        source: 'db-sequence-component',
        capabilities: {preview: 'browser', browserRender: true, workerRender: false, externalRender: false},
      };
    }
    const clipType = clip?.clipType;
    if (!clipType || !(clipType in sequenceRegistry)) return undefined;
    return {
      clipType,
      source: 'trusted-local-sequence',
      capabilities: {preview: 'browser', browserRender: false, workerRender: true, externalRender: false},
    };
  },
};
export const PUBLIC_ASTRID_ELEMENT_HOST = Object.freeze(publicAstridElementHost);

export const PUBLIC_ASTRID_ASSET_URLS = Object.freeze({
  card0, card1, card2, card3, card4, card5, frame,
});
