import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useInRouterContext } from 'react-router-dom';
import { EditorRuntimeProvider } from '@/tools/video-editor/contexts/EditorRuntimeProvider.tsx';
import { PublicPreviewMediaFailureProvider } from '@/tools/video-editor/compositions/PreviewMediaFailureContext.tsx';
import { createVideoEditorEffectCatalog } from '@/tools/video-editor/lib/effect-catalog.ts';
import { createVideoEditorSequenceComponentCatalog } from '@/tools/video-editor/lib/sequence-component-catalog.ts';
import type { TimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';
import { PUBLIC_TIMELINE_SERVICE_HOOKS } from '@/tools/video-editor/runtime/timelineHostServiceHooks.ts';
import { PUBLIC_ASTRID_ELEMENT_HOST } from './astrid-public-host.tsx';
import { PublicAstridExampleProvider, type PublicAstridExampleBundle } from './publicAstridExample.tsx';

const DENIED = Object.freeze({allowed: false, reason: 'timeline_read_only' as const});
export const PUBLIC_ASTRID_READ_ONLY_EDITABILITY: TimelineEditability = Object.freeze({
  checkTimeline: () => DENIED,
  check: () => DENIED,
  checkMove: () => DENIED,
});

const EMPTY_EFFECT_CATALOG = createVideoEditorEffectCatalog();
const EMPTY_SEQUENCE_CATALOG = createVideoEditorSequenceComponentCatalog();

function createPublicQueryClient(): QueryClient {
  return new QueryClient({defaultOptions: {queries: {retry: false}}});
}

/** One runtime parent for public preview, timeline, and inspector. */
export function PublicAstridEditorProvider({
  children,
  example,
  previewFailureEnabled = false,
}: {
  children: ReactNode;
  example: PublicAstridExampleBundle;
  previewFailureEnabled?: boolean;
}) {
  const [queryClient] = useState(createPublicQueryClient);
  const hasRouter = useInRouterContext();
  const editor = (
    <EditorRuntimeProvider
      astridElementHost={PUBLIC_ASTRID_ELEMENT_HOST}
      dataProvider={example.dataProvider}
      timelineId={example.timelineId}
      timelineServices={PUBLIC_TIMELINE_SERVICE_HOOKS}
      timelineName={example.metadata.timelineName}
      timelineEditability={PUBLIC_ASTRID_READ_ONLY_EDITABILITY}
      effectCatalog={EMPTY_EFFECT_CATALOG}
      sequenceComponentCatalog={EMPTY_SEQUENCE_CATALOG}
      runtime={{assetResolver: example.dataProvider, exporter: null, hostContext: null}}
      enableMutationServices={false}
      enableLiveServices={false}
      enableRenderExport={false}
      timelineOverlaysEnabled={false}
    >
      {children}
    </EditorRuntimeProvider>
  );

  return (
    <PublicAstridExampleProvider example={example}>
      <QueryClientProvider client={queryClient}>
        <PublicPreviewMediaFailureProvider enabled={previewFailureEnabled}>
          {hasRouter ? editor : <MemoryRouter initialEntries={['/']}>{editor}</MemoryRouter>}
        </PublicPreviewMediaFailureProvider>
      </QueryClientProvider>
    </PublicAstridExampleProvider>
  );
}
