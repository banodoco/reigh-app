/** Simplified shot reference used in selectors and dropdowns */
export interface ShotOption {
  id: string;
  name: string;
}

export interface PersistedShotRow {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string | null;
  project_id?: string;
  aspect_ratio?: string | null;
  position?: number;
  settings?: unknown;
}
