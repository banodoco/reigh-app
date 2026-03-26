type PayloadRecord = Record<string, unknown>;

interface TaskLineageFields {
  shotId?: string;
  basedOn?: string;
  sourceVariantId?: string;
  createAsGeneration?: boolean;
  toolType?: string;
  markPrimaryWhenBasedOn?: boolean;
}

export function setTaskLineageFields(
  payload: PayloadRecord,
  fields: TaskLineageFields,
): void {
  if (fields.shotId) payload["shot_id"] = fields.shotId;
  if (fields.basedOn) {
    payload["based_on"] = fields.basedOn;
    payload["parent_generation_id"] = fields.basedOn;
  }
  if (fields.sourceVariantId) payload["source_variant_id"] = fields.sourceVariantId;
  if (fields.createAsGeneration) payload["create_as_generation"] = true;
  if (fields.toolType) payload["tool_type"] = fields.toolType;
  if (fields.markPrimaryWhenBasedOn && fields.basedOn) payload["is_primary"] = true;
}
