export const presetQueryKeys = {
  featured: (presetIds?: string[]) => ['featured-presets', presetIds] as const,
  detail: (presetId: string) => ['preset-details', presetId] as const,
  name: (presetId: string) => ['preset-name', presetId] as const,
} as const;
