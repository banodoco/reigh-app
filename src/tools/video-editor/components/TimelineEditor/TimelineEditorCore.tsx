import { memo, useMemo } from 'react';
import { useTimelineDataSelector, useTimelineOpsSelector } from '@/tools/video-editor/hooks/timelineStore.ts';
import { useStaleVariants } from '@/tools/video-editor/hooks/useStaleVariants.ts';
import { useAddVariantAsGeneration } from '@/tools/video-editor/hooks/useAddVariantAsGeneration.ts';
import { useActiveTaskClips } from '@/tools/video-editor/hooks/useActiveTaskClips.ts';
import { MediaVariantPicker } from '@/shared/components/MediaVariantPicker.tsx';
import type { TimelineCoreHostObservations } from '@/tools/video-editor/runtime/editorHostObservations.ts';
import { TimelineEditorCoreBody, type TimelineEditorCoreProps } from './TimelineEditorCoreBody.tsx';

export {
  resolveVideoClipDoubleClickResolution,
  resolveSelectedGenerationIdsForShotCreation,
  resolveWaveformAudioSrc,
  resolveHostWaveformAudioSrc,
} from './TimelineEditorCoreBody.tsx';
export type { TimelineEditorCoreProps } from './TimelineEditorCoreBody.tsx';

/** Installed adapter keeps its task and variant hook ownership. */
function TimelineEditorCoreInstalled(props: TimelineEditorCoreProps) {
  const registry = useTimelineDataSelector((timeline) => timeline.resolvedConfig?.registry);
  const patchRegistry = useTimelineOpsSelector((ops) => ops.patchRegistry);
  const stale = useStaleVariants({registry, patchRegistry});
  const variant = useAddVariantAsGeneration();
  const {activeTaskAssetKeys} = useActiveTaskClips({registry});
  const hostObservations = useMemo<TimelineCoreHostObservations>(() => ({
    ...stale,
    addVariantAsGenerationAfterClip: variant.addVariantAsGenerationAfterClip,
    isAddingVariantAsGenerationPending: variant.isPending,
    activeTaskAssetKeys,
  }), [stale, variant, activeTaskAssetKeys]);
  return <TimelineEditorCoreBody {...props} hostObservations={hostObservations} VariantPicker={MediaVariantPicker} />;
}

export const TimelineEditorCore = memo(TimelineEditorCoreInstalled);
