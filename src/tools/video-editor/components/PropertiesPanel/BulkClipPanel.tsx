import { useEffectResources } from '@/tools/video-editor/hooks/useEffectResources.ts';
import { BulkClipPanelBody, type BulkClipPanelProps } from './BulkClipPanelBody.tsx';

export type { BulkClipPanelProps } from './BulkClipPanelBody.tsx';

/** Installed catalog adapter around the shared bulk inspector body. */
export function BulkClipPanel(props: BulkClipPanelProps) {
  const effectResources = useEffectResources();
  return <BulkClipPanelBody {...props} effectResources={effectResources} />;
}
