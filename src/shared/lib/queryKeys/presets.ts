export const presetQueryKeys = {
  featured: (presetIds?: string[]) => ['featured-presets', presetIds] as const,
  detail: (presetId: string) => ['preset-details', presetId] as const,
} as const;
