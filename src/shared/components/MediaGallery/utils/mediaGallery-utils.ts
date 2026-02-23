/**
 * Derive input images from task params
 * Strips any surrounding quotes from URLs that may have been improperly stored
 */
export const deriveGalleryInputImages = (task: { params?: unknown } | null | undefined): string[] => {
  const cleanUrl = (url: string): string => {
    if (typeof url !== 'string') return url;
    // Remove surrounding quotes if present
    return url.replace(/^["']|["']$/g, '');
  };

  const params = (
    task && typeof task === 'object' && 'params' in task
      ? (task as { params?: unknown }).params
      : {}
  ) as Record<string, unknown>;
  if (Array.isArray(params.input_images) && params.input_images.length > 0) {
    return (params.input_images as string[]).map(cleanUrl);
  }
  const payload = params.full_orchestrator_payload as Record<string, unknown> | undefined;
  if (payload && Array.isArray(payload.input_image_paths_resolved)) {
    return (payload.input_image_paths_resolved as string[]).map(cleanUrl);
  }
  if (Array.isArray(params.input_image_paths_resolved)) {
    return (params.input_image_paths_resolved as string[]).map(cleanUrl);
  }
  return [];
};
