import { LoraManager } from '@/shared/components/LoraManager';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import type { VideoPortionEditorLoraProps } from '@/shared/components/VideoPortionEditor/types';

type LoraEditorSectionProps = Pick<
  VideoPortionEditorLoraProps,
  'availableLoras' | 'projectId' | 'loraManager'
>;

export function LoraEditorSection({
  availableLoras,
  projectId,
  loraManager,
}: LoraEditorSectionProps) {
  return (
    <LoraManager
      availableLoras={availableLoras}
      projectId={projectId || undefined}
      persistenceScope="project"
      enableProjectPersistence={true}
      persistenceKey={TOOL_IDS.EDIT_VIDEO}
      externalLoraManager={loraManager}
      title="Additional LoRA Models (Optional)"
      addButtonText="Add or manage LoRAs"
    />
  );
}
