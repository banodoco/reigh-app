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
