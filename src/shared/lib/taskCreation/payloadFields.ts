export type PayloadRecord = Record<string, unknown>;

interface TaskLineageFields {
  shotId?: string;
  basedOn?: string;
  sourceVariantId?: string;
  createAsGeneration?: boolean;
  toolType?: string;
  markPrimaryWhenBasedOn?: boolean;
}

export function setPayloadField(
  payload: PayloadRecord,
  key: string,
  value: unknown,
): void {
  payload[key] = value;
}

export function setPayloadFieldIfDefined(
  payload: PayloadRecord,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    payload[key] = value;
  }
}

export function setPayloadFieldIfTruthy(
  payload: PayloadRecord,
  key: string,
  value: unknown,
): void {
  if (value) {
    payload[key] = value;
  }
}

export function setPayloadFieldIf(
  payload: PayloadRecord,
  key: string,
  value: unknown,
  shouldSet: boolean,
): void {
  if (shouldSet) {
    payload[key] = value;
  }
}

export function setTaskLineageFields(
  payload: PayloadRecord,
  fields: TaskLineageFields,
): void {
  setPayloadFieldIfTruthy(payload, 'shot_id', fields.shotId);
  setPayloadFieldIfTruthy(payload, 'based_on', fields.basedOn);
  // Keep both lineage keys for compatibility across workers that read either field.
  setPayloadFieldIfTruthy(payload, 'parent_generation_id', fields.basedOn);
  setPayloadFieldIfTruthy(payload, 'source_variant_id', fields.sourceVariantId);
  setPayloadFieldIf(payload, 'create_as_generation', true, Boolean(fields.createAsGeneration));
  setPayloadFieldIfTruthy(payload, 'tool_type', fields.toolType);
  setPayloadFieldIf(payload, 'is_primary', true, Boolean(fields.markPrimaryWhenBasedOn && fields.basedOn));
}
