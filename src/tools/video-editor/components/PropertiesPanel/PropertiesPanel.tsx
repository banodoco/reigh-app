import { memo, useMemo } from 'react';
import { useTimelineEditorData, useTimelineEditorOps } from '@/tools/video-editor/hooks/timelineStore.ts';
import { useStaleVariants } from '@/tools/video-editor/hooks/useStaleVariants.ts';
import { useAddVariantAsGeneration } from '@/tools/video-editor/hooks/useAddVariantAsGeneration.ts';
import { useOptionalEffectCatalog } from '@/tools/video-editor/runtime/catalogContexts.tsx';
import { createVideoEditorEffectCatalog } from '@/tools/video-editor/lib/effect-catalog.ts';
import { MediaVariantPicker } from '@/shared/components/MediaVariantPicker.tsx';
import { EffectCreatorPanel } from '@/tools/video-editor/components/EffectCreatorPanel.tsx';
import { ClipPanel } from './ClipPanel.tsx';
import { BulkClipPanel } from './BulkClipPanel.tsx';
import { PropertiesPanelBody, type PropertiesPanelProps } from './PropertiesPanelBody.tsx';
import { ExtensionManager, ExtensionManagerErrorBoundary } from '@/tools/video-editor/components/ExtensionManager';
import { ProcessDashboard } from '@/tools/video-editor/components/ProcessDashboard/ProcessDashboard';
import type { VariantObservations } from '@/tools/video-editor/runtime/editorHostObservations.ts';

export type { PropertiesPanelProps } from './PropertiesPanelBody.tsx';

const EMPTY_EFFECT_CATALOG = createVideoEditorEffectCatalog();

/** Installed task, variant, and resource adapter around the shared inspector. */
function PropertiesPanelInstalled(props: PropertiesPanelProps) {
  const {resolvedConfig} = useTimelineEditorData();
  const {patchRegistry} = useTimelineEditorOps();
  const stale = useStaleVariants({registry: resolvedConfig?.registry, patchRegistry});
  const variant = useAddVariantAsGeneration();
  const effectResources = useOptionalEffectCatalog() ?? EMPTY_EFFECT_CATALOG;
  const hostObservations = useMemo<VariantObservations>(() => ({
    ...stale,
    addVariantAsGenerationAfterClip: variant.addVariantAsGenerationAfterClip,
    isAddingVariantAsGenerationPending: variant.isPending,
  }), [stale, variant]);
  return (
    <PropertiesPanelBody
      {...props}
      hostObservations={hostObservations}
      effectResources={effectResources}
      VariantPicker={MediaVariantPicker}
      EffectCreator={EffectCreatorPanel}
      ClipInspector={ClipPanel}
      BulkInspector={BulkClipPanel}
      extensionManager={<ExtensionManagerErrorBoundary onError={() => {}}><ExtensionManager /></ExtensionManagerErrorBoundary>}
      processDashboard={<ProcessDashboard />}
    />
  );
}

export const PropertiesPanel = memo(PropertiesPanelInstalled);
