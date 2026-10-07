import { MediaVariantPicker } from '@/shared/components/MediaVariantPicker.tsx';
import { EffectCreatorPanel } from '@/tools/video-editor/components/EffectCreatorPanel.tsx';
import { useEffectResources } from '@/tools/video-editor/hooks/useEffectResources.ts';
import { ClipPanelBody, type ClipPanelProps } from './ClipPanelBody.tsx';

export { getVisibleClipTabs, FieldLabel, NO_EFFECT, NO_TRANSITION, TAB_COLUMNS_CLASS } from './ClipPanelBody.tsx';
export type { ClipPanelProps } from './ClipPanelBody.tsx';

/** Installed resource and variant adapter around the shared inspector body. */
export function ClipPanel(props: ClipPanelProps) {
  const effectResources = useEffectResources();
  return (
    <ClipPanelBody
      {...props}
      effectResources={effectResources}
      VariantPicker={MediaVariantPicker}
      EffectCreator={EffectCreatorPanel}
    />
  );
}
