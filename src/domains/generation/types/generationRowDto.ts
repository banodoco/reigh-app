import type { PersistedGenerationRow } from './generationRow';

/**
 * Transport aliases that appear on DB/API payloads.
 * Keep these outside the domain contract and map explicitly at boundaries.
 */
export interface GenerationRowLegacyAliases {
  thumbnail_url?: string | null; // DB column name (alias for thumbUrl)
  created_at?: string; // DB column name
  shotImageEntryId?: string; // Legacy alias for shot_generations id
  shot_generation_id?: string; // Legacy snake_case alias for shotImageEntryId
  variant_name?: string;
}

export type GenerationRowDto = PersistedGenerationRow & Partial<GenerationRowLegacyAliases>;
