import type { GenerationRow } from '@/types/shots';
import type { VideoTravelSettings } from '@/tools/travel-between-images/settings';

export interface SharedData {
  shot_id: string;
  shot_name: string;
  generation: GenerationRow;
  images: GenerationRow[];
  settings: VideoTravelSettings;
  creator_id: string | null;
  view_count: number;
  creator_username?: string | null;
  creator_name?: string | null;
  creator_avatar_url?: string | null;
}

export interface CreatorProfile {
  name: string | null;
  username: string | null;
  avatar_url: string | null;
}
