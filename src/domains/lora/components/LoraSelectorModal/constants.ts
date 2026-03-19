export const ITEMS_PER_PAGE = 12;

export const DEFAULT_FORM_STATE = {
  name: '',
  description: '',
  created_by_is_you: false,
  created_by_username: '',
  huggingface_url: '',
  base_model: 'Wan 2.2 I2V',
  is_public: true,
  trigger_word: '',
  high_noise_url: '',
  low_noise_url: '',
} as const;

export const BASE_MODEL_OPTIONS = [
  { value: 'LTX 2.3', label: 'LTX 2.3' },
  { value: 'Wan 2.2 I2V', label: 'Wan 2.2 I2V' },
  { value: 'Wan 2.2 T2V', label: 'Wan 2.2 T2V' },
  { value: 'Wan 2.1 I2V', label: 'Wan 2.1 I2V' },
  { value: 'Wan 2.1 T2V', label: 'Wan 2.1 T2V' },
  { value: 'Qwen Image', label: 'Qwen Image' },
  { value: 'Qwen Image Edit', label: 'Qwen Image Edit' },
  { value: 'Qwen Image Edit 2509', label: 'Qwen Image Edit 2509' },
  { value: 'Z-Image', label: 'Z-Image' },
] as const;
