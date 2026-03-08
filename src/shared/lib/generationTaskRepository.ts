import {
  supabaseClientRegistry,
  type SupabaseClientRegistry,
} from '@/integrations/supabase/client';
import { parseGenerationTaskId } from '@/shared/lib/generationTaskIdParser';

type ScopedGenerationInput = string | { id: string; projectId?: string };

const POSTGREST_NO_ROWS_CODE = 'PGRST116';

function isNoRowsPostgrestError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === POSTGREST_NO_ROWS_CODE) {
    return true;
  }
  return typeof candidate.message === 'string' && /0 rows/i.test(candidate.message);
}

export type GenerationTaskMappingStatus =
  | 'ok'
  | 'not_loaded'
  | 'missing_generation'
  | 'scope_mismatch'
  | 'invalid_tasks_shape'
  | 'query_failed';

export interface GenerationTaskMapping {
  generationId: string;
  taskId: string | null;
  status: GenerationTaskMappingStatus;
  queryError?: string;
}

export interface GenerationTaskMappingCacheEntry {
  taskId: string | null;
  status: GenerationTaskMappingStatus;
  queryError?: string;
}

type GenerationProjectScopeStatus =
  | 'ok'
  | 'query_failed'
  | 'missing_generation'
  | 'scope_mismatch'
  | 'missing_project_scope';

interface GenerationProjectScopeResolution {
  generationId: string;
  projectId: string | null;
  status: GenerationProjectScopeStatus;
  queryError?: string;
}

export type VariantProjectScopeStatus =
  | 'ok'
  | 'query_failed'
  | 'missing_variant'
  | 'missing_generation'
  | 'scope_mismatch'
  | 'missing_project_scope';

interface VariantProjectScopeResolution {
  variantId: string;
  generationId: string | null;
  projectId: string | null;
  status: VariantProjectScopeStatus;
  queryError?: string;
}

interface GenerationTaskRepositoryOptions {
  projectId?: string;
  supabaseRegistry?: SupabaseClientRegistry;
}

export async function resolveGenerationProjectScope(
  generationId: string,
  expectedProjectId?: string,
  supabaseRegistry: SupabaseClientRegistry = supabaseClientRegistry,
): Promise<GenerationProjectScopeResolution> {
  const supabaseResult = supabaseRegistry.getClientResult();
  if (!supabaseResult.ok) {
    return {
      generationId,
      projectId: null,
      status: 'query_failed',
      queryError: supabaseResult.error.message,
    };
  }

  const supabase = supabaseResult.client;
  const { data, error } = await supabase
    .from('generations')
    .select('id, project_id')
    .eq('id', generationId)
    .maybeSingle();

  if (error) {
    if (isNoRowsPostgrestError(error)) {
      return {
        generationId,
        projectId: null,
        status: 'missing_generation',
      };
    }
    return {
      generationId,
      projectId: null,
      status: 'query_failed',
      queryError: error.message,
    };
  }

  if (!data) {
    return {
      generationId,
      projectId: null,
      status: 'missing_generation',
    };
  }

  if (expectedProjectId && data.project_id !== expectedProjectId) {
    return {
      generationId,
      projectId: data.project_id ?? null,
      status: 'scope_mismatch',
    };
  }

  if (!data.project_id) {
    return {
      generationId,
      projectId: null,
      status: 'missing_project_scope',
    };
  }

  return {
    generationId,
    projectId: data.project_id,
    status: 'ok',
  };
}

export async function resolveVariantProjectScope(
  variantId: string,
  expectedProjectId?: string,
  supabaseRegistry: SupabaseClientRegistry = supabaseClientRegistry,
): Promise<VariantProjectScopeResolution> {
  const supabaseResult = supabaseRegistry.getClientResult();
  if (!supabaseResult.ok) {
    return {
      variantId,
      generationId: null,
      projectId: null,
      status: 'query_failed',
      queryError: supabaseResult.error.message,
    };
  }

  const supabase = supabaseResult.client;
  const { data, error } = await supabase
    .from('generation_variants')
    .select('id, generation_id, project_id')
    .eq('id', variantId)
    .maybeSingle();

  if (error) {
    if (isNoRowsPostgrestError(error)) {
      return {
        variantId,
        generationId: null,
        projectId: null,
        status: 'missing_variant',
      };
    }
    return {
      variantId,
      generationId: null,
      projectId: null,
      status: 'query_failed',
      queryError: error.message,
    };
  }

  if (!data) {
    return {
      variantId,
      generationId: null,
      projectId: null,
      status: 'missing_variant',
    };
  }

  if (!data.generation_id) {
    return {
      variantId,
      generationId: null,
      projectId: data.project_id ?? null,
      status: 'missing_generation',
    };
  }

  if (expectedProjectId && data.project_id && data.project_id !== expectedProjectId) {
    return {
      variantId,
      generationId: data.generation_id,
      projectId: data.project_id,
      status: 'scope_mismatch',
    };
  }

  const generationScope = await resolveGenerationProjectScope(
    data.generation_id,
    expectedProjectId,
    supabaseRegistry,
  );

  if (generationScope.status !== 'ok') {
    return {
      variantId,
      generationId: data.generation_id,
      projectId: generationScope.projectId,
      status: generationScope.status,
      queryError: generationScope.queryError,
    };
  }

  return {
    variantId,
    generationId: data.generation_id,
    projectId: generationScope.projectId,
    status: 'ok',
  };
}

export async function getPrimaryTaskIdForGeneration(
  generationId: string,
  options?: GenerationTaskRepositoryOptions,
): Promise<GenerationTaskMapping> {
  const mappings = await getPrimaryTaskMappingsForGenerations([generationId], options);
  return mappings.get(generationId) ?? {
    generationId,
    taskId: null,
    status: 'missing_generation',
  };
}

export async function getPrimaryTaskMappingsForGenerations(
  generationIds: string[],
  options?: GenerationTaskRepositoryOptions,
): Promise<Map<string, GenerationTaskMapping>> {
  if (generationIds.length === 0) {
    return new Map();
  }

  const requestedIds = Array.from(new Set(generationIds));
  const supabaseResult = (options?.supabaseRegistry ?? supabaseClientRegistry).getClientResult();
  if (!supabaseResult.ok) {
    const failures = new Map<string, GenerationTaskMapping>();
    requestedIds.forEach((generationId) => {
      failures.set(generationId, {
        generationId,
        taskId: null,
        status: 'query_failed',
        queryError: supabaseResult.error.message,
      });
    });
    return failures;
  }

  const supabase = supabaseResult.client;
  const query = supabase
    .from('generations')
    .select('id, tasks, project_id')
    .in('id', requestedIds);

  const { data, error } = await query;

  if (error) {
    const failures = new Map<string, GenerationTaskMapping>();
    requestedIds.forEach((generationId) => {
      failures.set(generationId, {
        generationId,
        taskId: null,
        status: 'query_failed',
        queryError: error.message,
      });
    });
    return failures;
  }

  const rowsById = new Map((data || []).map((row) => [row.id, row]));

  const mappings = new Map<string, GenerationTaskMapping>();
  for (const generationId of requestedIds) {
    const row = rowsById.get(generationId);

    if (!row) {
      mappings.set(generationId, {
        generationId,
        taskId: null,
        status: 'missing_generation',
      });
      continue;
    }

    if (options?.projectId && row.project_id !== options.projectId) {
      mappings.set(generationId, {
        generationId,
        taskId: null,
        status: 'scope_mismatch',
      });
      continue;
    }

    const parsed = parseGenerationTaskId(row.tasks);
    mappings.set(generationId, {
      generationId,
      taskId: parsed.taskId,
      status: parsed.status,
    });
  }

  return mappings;
}

export function toGenerationTaskMappingCacheEntry(
  mapping: GenerationTaskMapping | undefined,
): GenerationTaskMappingCacheEntry {
  return {
    taskId: mapping?.taskId ?? null,
    status: mapping?.status ?? 'not_loaded',
    ...(mapping?.queryError ? { queryError: mapping.queryError } : {}),
  };
}
