/** LoRA config using storage path + strength (local Comfy generation, travel, join clips) */
export interface PathLoraConfig {
  path: string;
  strength: number;
}

/** LoRA config using URL + strength (Comfy edit workflows: inpaint, magic edit, annotated edit) */
export interface ComfyLoraConfig {
  url: string;
  strength: number;
}

/** LoRA config for Fal.ai APIs (uses path + scale) */
export interface FalLoraConfig {
  path: string;
  scale?: number;
}

interface LoraModelImage {
  alt_text: string;
  url: string;
  type?: string;
  source?: string;
  [key: string]: unknown;
}

interface LoraModelFile {
  path: string;
  url: string;
  size?: number;
  last_modified?: string;
}

export interface LoraModel {
  "Model ID": string;
  Name: string;
  Author: string;
  Images: LoraModelImage[];
  "Model Files": LoraModelFile[];
  Description?: string;
  Tags?: string[];
  "Last Modified"?: string;
  Downloads?: number;
  Likes?: number;
  lora_type?: string;
  created_by?: {
    is_you: boolean;
    username?: string;
  };
  huggingface_url?: string;
  filename?: string;
  base_model?: string;
  sample_generations?: {
    url: string;
    type: 'image' | 'video';
    alt_text?: string;
  }[];
  main_generation?: string;
  is_public?: boolean;
  trigger_word?: string;
  high_noise_url?: string;
  low_noise_url?: string;
  _resourceId?: string;
  [key: string]: unknown;
}
