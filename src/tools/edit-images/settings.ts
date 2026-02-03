export const editImagesSettings = {
  id: 'edit-images',
  scope: ['project'] as const,
  defaults: {
    // No specific settings defaults needed yet
  },
};

// Type is inferred from defaults, not exported since unused
