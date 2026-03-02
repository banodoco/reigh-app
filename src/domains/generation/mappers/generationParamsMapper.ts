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

function reportMapperIssue(_context: string, _logData: Record<string, unknown>): void {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return;
  }

  // Surface mapper diagnostics only in dev to avoid noisy production logs.
  console.warn(`[generationParamsMapper] ${_context}`, _logData);
}

function reportLegacyAliasUsage(
  mapper: 'toGenerationParams' | 'toPersistedGenerationParams',
  aliasKey: string,
  canonicalKey: string,
): void {
  reportMapperIssue('Legacy alias key used as fallback', {
    mapper,
    aliasKey,
    canonicalKey,
  });
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

type PayloadDirection = 'domain' | 'persisted' | 'derived';

function sanitizeOptionalStringField(
  payload: Record<string, unknown>,
  key: string,
  direction: PayloadDirection,
  payloadType: 'orchestratorDetails' | 'extra',
): void {
  const value = payload[key];
  if (!isPresent(value)) {
    return;
  }
  if (typeof value === 'string') {
    return;
  }
  reportMapperIssue('Dropping invalid payload string field', {
    payloadType,
    key,
    direction,
    receivedType: typeof value,
  });
  delete payload[key];
}

function sanitizeOptionalNullableStringField(
  payload: Record<string, unknown>,
  key: string,
  direction: PayloadDirection,
  payloadType: 'orchestratorDetails' | 'extra',
): void {
  const value = payload[key];
  if (!isPresent(value) || value === null) {
    return;
  }
  if (typeof value === 'string') {
    return;
  }
  reportMapperIssue('Dropping invalid payload nullable-string field', {
    payloadType,
    key,
    direction,
    receivedType: typeof value,
  });
  delete payload[key];
}

function sanitizeOptionalNumberField(
  payload: Record<string, unknown>,
  key: string,
  direction: PayloadDirection,
  payloadType: 'orchestratorDetails' | 'extra',
): void {
  const value = payload[key];
  if (!isPresent(value)) {
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return;
  }
  reportMapperIssue('Dropping invalid payload number field', {
    payloadType,
    key,
    direction,
    receivedType: typeof value,
  });
  delete payload[key];
}

function sanitizeAdditionalLoras(
  payload: Record<string, unknown>,
  direction: PayloadDirection,
): void {
  const value = payload.additional_loras;
  if (!isPresent(value)) {
    return;
  }

  if (!isRecord(value)) {
    reportMapperIssue('Dropping invalid additional_loras payload', {
      direction,
      receivedType: typeof value,
    });
    delete payload.additional_loras;
    return;
  }

  const sanitized: Record<string, number> = {};
  for (const [loraKey, loraStrength] of Object.entries(value)) {
    if (typeof loraStrength === 'number' && Number.isFinite(loraStrength)) {
      sanitized[loraKey] = loraStrength;
      continue;
    }
    reportMapperIssue('Dropping invalid additional_loras entry', {
      direction,
      loraKey,
      receivedType: typeof loraStrength,
    });
  }

  payload.additional_loras = sanitized;
}

function sanitizeMotionMode(payload: Record<string, unknown>, direction: PayloadDirection): void {
  const value = payload.motion_mode;
  if (!isPresent(value)) {
    return;
  }

  if (value === 'basic' || value === 'presets' || value === 'advanced') {
    return;
  }

  reportMapperIssue('Dropping invalid motion_mode payload field', {
    direction,
    receivedType: typeof value,
    value,
  });
  delete payload.motion_mode;
}

function validateOrchestratorDetailsPayload(
  value: unknown,
  direction: PayloadDirection,
): OrchestratorDetailsPayload | undefined {
  if (!isPresent(value)) {
    return undefined;
  }

  if (!isRecord(value)) {
    reportMapperIssue('Ignoring non-object orchestrator payload', {
      direction,
      receivedType: typeof value,
    });
    return undefined;
  }

  const payload: Record<string, unknown> = { ...value };
  sanitizeOptionalStringField(payload, 'prompt', direction, 'orchestratorDetails');
  sanitizeOptionalStringField(payload, 'base_prompt', direction, 'orchestratorDetails');
  sanitizeOptionalStringField(payload, 'negative_prompt', direction, 'orchestratorDetails');
  sanitizeOptionalStringField(payload, 'model_name', direction, 'orchestratorDetails');
  sanitizeOptionalStringField(payload, 'parsed_resolution_wh', direction, 'orchestratorDetails');
  sanitizeOptionalNumberField(payload, 'seed_base', direction, 'orchestratorDetails');
  sanitizeOptionalNullableStringField(payload, 'selected_phase_preset_id', direction, 'orchestratorDetails');
  sanitizeAdditionalLoras(payload, direction);
  sanitizeMotionMode(payload, direction);

  return payload as OrchestratorDetailsPayload;
}

function validateGenerationExtraPayload(
  value: unknown,
  direction: PayloadDirection,
): GenerationExtraPayload | undefined {
  if (!isPresent(value)) {
    return undefined;
  }

  if (!isRecord(value)) {
    reportMapperIssue('Ignoring non-object extra payload', {
      direction,
      receivedType: typeof value,
    });
    return undefined;
  }

  const payload: Record<string, unknown> = { ...value };
  sanitizeOptionalStringField(payload, 'source', direction, 'extra');
  sanitizeOptionalStringField(payload, 'original_filename', direction, 'extra');
  sanitizeOptionalStringField(payload, 'file_type', direction, 'extra');
  sanitizeOptionalNumberField(payload, 'file_size', direction, 'extra');

  return payload as GenerationExtraPayload;
}

function extractExtra(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!CONSUMED_KEYS.has(key)) {
      extra[key] = value;
    }
  }

  if (isPresent(record.extra) && !isRecord(record.extra)) {
    reportMapperIssue('Ignoring non-object extra payload', {
      direction: 'derived',
      receivedType: typeof record.extra,
    });
  }

  if (isRecord(record.extra)) {
    Object.assign(extra, record.extra);
  }

  return Object.keys(extra).length > 0
    ? extra
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
    if (domainValue !== undefined && persistedValue === undefined) {
      reportLegacyAliasUsage('toGenerationParams', mapping.domainKey, mapping.persistedKey);
    }
    const value = persistedValue ?? domainValue;

    if (value !== undefined) {
      out[mapping.domainKey] = value;
    }
  }

  if (isPresent(record.originalParams) && !isPresent(record.original_params)) {
    reportLegacyAliasUsage('toGenerationParams', 'originalParams', 'original_params');
  }
  const originalParams = record.original_params ?? record.originalParams;
  if (isPresent(originalParams)) {
    out.originalParams = originalParams;
  }

  const persistedOrchestratorDetails = validateOrchestratorDetailsPayload(record.orchestrator_details, 'persisted');
  const domainOrchestratorDetails = validateOrchestratorDetailsPayload(record.orchestratorDetails, 'domain');
  if (!persistedOrchestratorDetails && domainOrchestratorDetails) {
    reportLegacyAliasUsage('toGenerationParams', 'orchestratorDetails', 'orchestrator_details');
  }
  const orchestratorDetails = persistedOrchestratorDetails ?? domainOrchestratorDetails;
  if (orchestratorDetails) {
    out.orchestratorDetails = orchestratorDetails;
  }

  const extra = validateGenerationExtraPayload(extractExtra(record), 'derived');
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
    if (persistedValue !== undefined && domainValue === undefined) {
      reportLegacyAliasUsage('toPersistedGenerationParams', mapping.persistedKey, mapping.domainKey);
    }
    const value = domainValue ?? persistedValue;

    if (value !== undefined) {
      out[mapping.persistedKey] = value;
    }
  }

  if (isPresent(record.original_params) && !isPresent(record.originalParams)) {
    reportLegacyAliasUsage('toPersistedGenerationParams', 'original_params', 'originalParams');
  }
  const originalParams = record.originalParams ?? record.original_params;
  if (isPresent(originalParams)) {
    out.original_params = originalParams;
  }

  const domainOrchestratorDetails = validateOrchestratorDetailsPayload(record.orchestratorDetails, 'domain');
  const persistedOrchestratorDetails = validateOrchestratorDetailsPayload(record.orchestrator_details, 'persisted');
  if (!domainOrchestratorDetails && persistedOrchestratorDetails) {
    reportLegacyAliasUsage('toPersistedGenerationParams', 'orchestrator_details', 'orchestratorDetails');
  }
  const orchestratorDetails = domainOrchestratorDetails ?? persistedOrchestratorDetails;
  if (orchestratorDetails) {
    out.orchestrator_details = orchestratorDetails;
  }

  const extra = validateGenerationExtraPayload(extractExtra(record), 'derived');
  if (extra !== undefined) {
    out.extra = extra;
  }

  return out as PersistedGenerationParams;
}
