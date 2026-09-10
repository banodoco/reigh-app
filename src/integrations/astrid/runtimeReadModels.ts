import { asRecord } from '@/shared/lib/typeCoercion';
import {
  BridgeContractError,
  type BridgeAdmittedTask,
  type BridgeGenerationDetailPayload,
  type BridgeGenerationSummary,
  type BridgeTaskDetailPayload,
  type BridgeTaskSpec,
  type BridgeTaskSummary,
  type BridgeGenerationVariant,
  type RuntimeGenerationResource,
  type RuntimeTaskResource,
  type RuntimeVariantResource,
} from '@/tools/video-editor/data/bridgeContract.ts';

function runtimeSpec(resource: RuntimeTaskResource): BridgeTaskSpec {
  const envelope = asRecord(resource.spec);
  const spec = asRecord(envelope?.spec) ?? {};
  const schemaVersion = Number(resource.schema_version);

  return {
    ...(Number.isInteger(schemaVersion) ? { schema_version: schemaVersion } : {}),
    ...(typeof spec.family === 'string' ? { family: spec.family } : {}),
    ...(typeof spec.source_task_type === 'string' ? { source_task_type: spec.source_task_type } : {}),
    ...(asRecord(spec.params) ? { params: asRecord(spec.params)! } : {}),
    ...(asRecord(spec.output_policy) ? { output_policy: asRecord(spec.output_policy)! } : {}),
  };
}

function taskProjectId(resource: RuntimeTaskResource, projectSlug: string): string {
  return resource.project_id ?? projectSlug;
}

export function runtimeTaskToSummary(
  resource: RuntimeTaskResource,
  projectSlug: string,
): BridgeTaskSummary {
  return {
    task_id: resource.task_id,
    project_id: taskProjectId(resource, projectSlug),
    capability: resource.capability_id,
    status: resource.state,
    spec: runtimeSpec(resource),
    created_at: resource.created_at,
    updated_at: resource.updated_at,
    winning_attempt_id: resource.attempt_id,
  };
}

export function runtimeTaskToAdmittedTask(
  resource: RuntimeTaskResource,
  projectSlug: string,
): BridgeAdmittedTask {
  return {
    id: resource.task_id,
    project_id: taskProjectId(resource, projectSlug),
    capability: resource.capability_id,
    spec: runtimeSpec(resource),
    status: resource.state,
    run_id: resource.run_id,
    winning_attempt_id: resource.attempt_id,
    created_at: resource.created_at,
    updated_at: resource.updated_at,
  };
}

function runtimeOutputs(resource: RuntimeTaskResource): BridgeTaskDetailPayload['task']['outputs'] {
  const result = asRecord(resource.result);
  const outputs = result?.outputs;
  if (outputs === undefined) return undefined;
  if (!Array.isArray(outputs)) {
    throw new BridgeContractError('task result', 'result.outputs must be an array');
  }

  return outputs.map((value, ordinal) => {
    const output = asRecord(value);
    if (!output || typeof output.digest !== 'string' || !output.digest.startsWith('sha256:')) {
      throw new BridgeContractError('task result output', `output ${ordinal} has no CAS digest`);
    }
    return {
      ordinal,
      role: typeof output.name === 'string' && output.name.length > 0 ? output.name : 'output',
      media_id: output.digest,
      is_primary: ordinal === 0,
      params_json: {
        media_type: output.media_type,
        size: output.size,
      },
    };
  });
}

export function runtimeTaskToDetail(
  resource: RuntimeTaskResource,
  projectSlug: string,
): BridgeTaskDetailPayload['task'] {
  const summary = runtimeTaskToSummary(resource, projectSlug);
  const outputs = runtimeOutputs(resource);
  return {
    ...summary,
    // The neutral task resource intentionally exposes task state, not the
    // bridge's executor-diagnostics projection. Keep the legacy read model
    // explicit and empty rather than inventing lease fields.
    attempts: [],
    ...(outputs ? { outputs } : {}),
  };
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  return typeof metadata[key] === 'string' ? metadata[key] as string : null;
}

function metadataBoolean(metadata: Record<string, unknown>, key: string): boolean | undefined {
  return typeof metadata[key] === 'boolean' ? metadata[key] as boolean : undefined;
}

function metadataRecord(metadata: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  return asRecord(metadata[key]) ?? undefined;
}

function runtimeVariantToBridge(
  resource: RuntimeVariantResource,
  index: number,
  hasExplicitPrimary: boolean,
): BridgeGenerationVariant {
  if (resource.object_id === null) {
    throw new BridgeContractError(
      'generation variant',
      `variant ${resource.variant_id} has no CAS object identity`,
    );
  }
  const metadata = resource.metadata;
  return {
    id: resource.variant_id,
    generation_id: resource.generation_id,
    media_id: resource.object_id,
    object_id: resource.object_id,
    variant_type: resource.variant_type,
    name: metadataString(metadata, 'name'),
    params: metadataRecord(metadata, 'params'),
    is_primary: hasExplicitPrimary
      ? metadataBoolean(metadata, 'is_primary') === true
      : index === 0,
    starred: metadataBoolean(metadata, 'starred') === true,
    viewed_at: metadataString(metadata, 'viewed_at'),
    created_at: resource.created_at,
  };
}

export function runtimeGenerationToDetail(
  resource: RuntimeGenerationResource,
  variants: RuntimeVariantResource[],
): BridgeGenerationDetailPayload['generation'] {
  const metadata = resource.metadata;
  const hasExplicitPrimary = variants.some((variant) => metadataBoolean(variant.metadata, 'is_primary') !== undefined);
  return {
    generation_id: resource.generation_id,
    project_id: resource.project_id,
    task_id: resource.source_task_id,
    type: resource.type,
    version: resource.version,
    name: metadataString(metadata, 'name'),
    based_on_generation_id: metadataString(metadata, 'based_on_generation_id'),
    parent_generation_id: metadataString(metadata, 'parent_generation_id'),
    child_order: typeof metadata.child_order === 'number' ? metadata.child_order : null,
    params: metadataRecord(metadata, 'params') ?? {},
    starred: metadataBoolean(metadata, 'starred') === true,
    deleted_at: metadataString(metadata, 'deleted_at'),
    created_at: resource.created_at,
    updated_at: resource.updated_at,
    variants: variants.map((variant, index) => runtimeVariantToBridge(variant, index, hasExplicitPrimary)),
    items: Array.isArray(metadata.items) ? metadata.items.filter((item): item is Record<string, unknown> => Boolean(asRecord(item))) : [],
  };
}

export function runtimeGenerationToSummary(
  resource: RuntimeGenerationResource,
  variants: RuntimeVariantResource[],
): BridgeGenerationSummary {
  const detail = runtimeGenerationToDetail(resource, variants);
  const primary = detail.variants.find((variant) => variant.is_primary) ?? null;
  return {
    generation_id: detail.generation_id,
    name: detail.name ?? null,
    type: detail.type,
    params: detail.params,
    starred: detail.starred,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    primary: primary ? { media_id: primary.media_id, variant_type: primary.variant_type } : null,
    variant_count: detail.variants.length,
  };
}
