import { CodePathParamEditor } from '@/tools/video-editor/components/SequenceCreator/CodePathParamEditor.tsx';
import { useOptionalVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { ClipPanelProps } from './ClipPanelBody.tsx';
import {
  resolveAstridElementParamDescriptor,
  type AstridElementParamDescriptor,
} from './astrid-element-param-descriptor.ts';

/** Editable manifest parameters for the exact pinned Astrid element revision. */
export function AstridElementParams({
  clip,
  readOnly,
  registry,
  onChange,
  descriptor: suppliedDescriptor,
}: Pick<ClipPanelProps, 'clip' | 'readOnly' | 'registry' | 'onChange'> & {
  descriptor?: AstridElementParamDescriptor;
}) {
  const runtime = useOptionalVideoEditorRuntime();
  const descriptor = suppliedDescriptor ?? resolveAstridElementParamDescriptor(
    clip,
    readOnly,
    runtime?.timelineEditability,
  );
  if (!clip || !descriptor) return null;
  const params = { ...descriptor.defaults, ...(clip.params ?? {}) };
  const saveParams = (nextParams: Record<string, unknown>) => {
    if (readOnly) return;
    const currentPermission = runtime?.timelineEditability?.check({
      clipId: clip.id,
      sourceTrackId: clip.track,
      targetTrackId: clip.track,
    });
    if (currentPermission?.allowed === false) return;
    onChange({ params: { ...params, ...nextParams } });
  };

  return (
    <section
      className="mt-3 space-y-2 rounded-xl border border-border bg-card/70 p-3"
      data-testid="astrid-element-params"
    >
      <div>
        <h3 className="text-sm font-medium text-foreground">{descriptor.label} parameters</h3>
        <p className="text-xs text-muted-foreground">Values save with this pinned element revision.</p>
      </div>
      <CodePathParamEditor
        schemaJson={descriptor.schema}
        values={params}
        allowedAssetKeys={Object.keys(registry)}
        onChange={saveParams}
      />
    </section>
  );
}

export type { AstridElementParamDescriptor } from './astrid-element-param-descriptor.ts';
