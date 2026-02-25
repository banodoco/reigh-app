import type {
  GenerationParams,
  GenerationExtraPayload,
  OrchestratorDetailsPayload,
  PersistedGenerationParams,
} from '@/domains/generation/types/generationParams';

type ParamsInput =
  | PersistedGenerationParams
  | GenerationParams
  | Record<string, unknown>;

type PrimitiveFieldType = 'string' | 'number';

interface FieldMapping {
  domainKey: keyof GenerationParams;
  persistedKey: keyof PersistedGenerationParams;
  type: PrimitiveFieldType;
}

const FIELD_MAPPINGS = [
  { domainKey: 'prompt', persistedKey: 'prompt', type: 'string' },
  { domainKey: 'basePrompt', persistedKey: 'base_prompt', type: 'string' },
  { domainKey: 'negativePrompt', persistedKey: 'negative_prompt', type: 'string' },
  { domainKey: 'seed', persistedKey: 'seed', type: 'number' },
  { domainKey: 'guidanceScale', persistedKey: 'guidance_scale', type: 'number' },
  { domainKey: 'numInferenceSteps', persistedKey: 'num_inference_steps', type: 'number' },
  { domainKey: 'width', persistedKey: 'width', type: 'number' },
  { domainKey: 'height', persistedKey: 'height', type: 'number' },
  { domainKey: 'resolution', persistedKey: 'resolution', type: 'string' },
  { domainKey: 'aspectRatio', persistedKey: 'aspect_ratio', type: 'string' },
  { domainKey: 'customAspectRatio', persistedKey: 'custom_aspect_ratio', type: 'string' },
  { domainKey: 'shotId', persistedKey: 'shot_id', type: 'string' },
  { domainKey: 'sourceImagePath', persistedKey: 'source_image_path', type: 'string' },
  { domainKey: 'styleImagePath', persistedKey: 'style_image_path', type: 'string' },
] as const satisfies readonly FieldMapping[];

const CONSUMED_KEYS: ReadonlySet<string> = new Set([
  ...FIELD_MAPPINGS.flatMap((mapping) => [mapping.domainKey, mapping.persistedKey]),
  'originalParams',
  'original_params',
  'orchestratorDetails',
  'orchestrator_details',
  'extra',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function readPrimitive(value: unknown, type: PrimitiveFieldType): string | number | undefined {
  if (type === 'string') {
    return typeof value === 'string' ? value : undefined;
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function reportMapperIssue(context: string, logData: Record<string, unknown>): void {
  if (!import.meta.env.DEV) {
    return;
  }
  void context;
  void logData;
}

function readMappedValue(
  record: Record<string, unknown>,
  key: string,
  expectedType: PrimitiveFieldType,
  direction: 'domain' | 'persisted',
): string | number | undefined {
  const raw = record[key];

  if (!isPresent(raw)) {
    return undefined;
  }

  const parsed = readPrimitive(raw, expectedType);
  if (parsed !== undefined) {
    return parsed;
  }

  reportMapperIssue('Dropping invalid mapped field value', {
    key,
    direction,
    expectedType,
    receivedType: typeof raw,
  });
  return undefined;
}

function toOrchestratorDetailsPayload(
  value: unknown,
): OrchestratorDetailsPayload | undefined {
  return isRecord(value) ? (value as OrchestratorDetailsPayload) : undefined;
}

function toGenerationExtraPayload(
  value: unknown,
): GenerationExtraPayload | undefined {
  return isRecord(value) ? (value as GenerationExtraPayload) : undefined;
}

function extractExtra(record: Record<string, unknown>): GenerationExtraPayload | undefined {
  const extra: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!CONSUMED_KEYS.has(key)) {
      extra[key] = value;
    }
  }

  if (isPresent(record.extra) && !isRecord(record.extra)) {
    reportMapperIssue('Ignoring non-object extra payload', {
      receivedType: typeof record.extra,
    });
  }

  if (isRecord(record.extra)) {
    Object.assign(extra, record.extra);
  }

  return Object.keys(extra).length > 0
    ? (extra as GenerationExtraPayload)
    : undefined;
}

/**
 * Translate persisted (snake_case) params into normalized domain shape.
 */
export function toGenerationParams(input: ParamsInput | null | undefined): GenerationParams {
  if (!isRecord(input)) {
    if (isPresent(input)) {
      reportMapperIssue('toGenerationParams received non-object input', {
        receivedType: typeof input,
      });
    }
    return {};
  }

  const record = input;
  const out: Record<string, unknown> = {};

  for (const mapping of FIELD_MAPPINGS) {
    const domainValue = readMappedValue(record, mapping.domainKey, mapping.type, 'domain');
    const persistedValue = readMappedValue(record, mapping.persistedKey, mapping.type, 'persisted');
    const value = domainValue ?? persistedValue;

    if (value !== undefined) {
      out[mapping.domainKey] = value;
    }
  }

  const originalParams = record.originalParams ?? record.original_params;
  if (isPresent(originalParams)) {
    out.originalParams = originalParams;
  }

  const hasDomainDetails = isPresent(record.orchestratorDetails);
  const hasPersistedDetails = isPresent(record.orchestrator_details);

  if (hasDomainDetails && !isRecord(record.orchestratorDetails)) {
    reportMapperIssue('Ignoring invalid orchestratorDetails value', {
      receivedType: typeof record.orchestratorDetails,
      direction: 'domain',
    });
  }
  if (hasPersistedDetails && !isRecord(record.orchestrator_details)) {
    reportMapperIssue('Ignoring invalid orchestrator_details value', {
      receivedType: typeof record.orchestrator_details,
      direction: 'persisted',
    });
  }

  const orchestratorDetails = toOrchestratorDetailsPayload(record.orchestratorDetails)
    ?? toOrchestratorDetailsPayload(record.orchestrator_details);
  if (orchestratorDetails) {
    out.orchestratorDetails = orchestratorDetails;
  }

  const extra = extractExtra(record);
  if (extra) {
    out.extra = extra;
  }

  return out as GenerationParams;
}

/**
 * Translate normalized domain params into persisted (snake_case) shape.
 */
export function toPersistedGenerationParams(
  input: ParamsInput | null | undefined,
): PersistedGenerationParams {
  if (!isRecord(input)) {
    if (isPresent(input)) {
      reportMapperIssue('toPersistedGenerationParams received non-object input', {
        receivedType: typeof input,
      });
    }
    return {};
  }

  const record = input;
  const out: Record<string, unknown> = {};

  for (const mapping of FIELD_MAPPINGS) {
    const persistedValue = readMappedValue(record, mapping.persistedKey, mapping.type, 'persisted');
    const domainValue = readMappedValue(record, mapping.domainKey, mapping.type, 'domain');
    const value = persistedValue ?? domainValue;

    if (value !== undefined) {
      out[mapping.persistedKey] = value;
    }
  }

  const originalParams = record.original_params ?? record.originalParams;
  if (isPresent(originalParams)) {
    out.original_params = originalParams;
  }

  const hasPersistedDetails = isPresent(record.orchestrator_details);
  const hasDomainDetails = isPresent(record.orchestratorDetails);

  if (hasPersistedDetails && !isRecord(record.orchestrator_details)) {
    reportMapperIssue('Ignoring invalid orchestrator_details value', {
      receivedType: typeof record.orchestrator_details,
      direction: 'persisted',
    });
  }
  if (hasDomainDetails && !isRecord(record.orchestratorDetails)) {
    reportMapperIssue('Ignoring invalid orchestratorDetails value', {
      receivedType: typeof record.orchestratorDetails,
      direction: 'domain',
    });
  }

  const orchestratorDetails = toOrchestratorDetailsPayload(record.orchestrator_details)
    ?? toOrchestratorDetailsPayload(record.orchestratorDetails);
  if (orchestratorDetails) {
    out.orchestrator_details = orchestratorDetails;
  }

  const extra = toGenerationExtraPayload(extractExtra(record));
  if (extra !== undefined) {
    out.extra = extra;
  }

  return out as PersistedGenerationParams;
}
