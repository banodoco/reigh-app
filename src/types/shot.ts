import type { GenerationRow } from '@/types/generationRow';

export interface Shot {
  id: string;
  name: string;
  images?: GenerationRow[]; // Populated by joining shot + generation data
  created_at?: string;
  updated_at?: string | null;
  project_id?: string;
  aspect_ratio?: string | null;
  position?: number; // Manual ordering within project
  settings?: unknown;

  // Pre-computed stats (used to avoid reactive flicker)
  imageCount?: number;
  positionedImageCount?: number;
  unpositionedImageCount?: number;
  hasUnpositionedImages?: boolean;
}
