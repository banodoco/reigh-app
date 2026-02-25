import type { Json } from '@/integrations/supabase/types';

export type ExternalService = 'huggingface' | 'replicate' | 'civitai';

export type ExternalApiKeyMetadata = Record<string, Json | undefined>;

export interface ExternalApiKey {
  id: string;
  service: ExternalService;
  key_value?: string;
  metadata: ExternalApiKeyMetadata;
  created_at: string;
  updated_at: string;
}

export interface HuggingFaceMetadata {
  username?: string;
  verified?: boolean;
  verifiedAt?: string;
}
