import { parseRatio } from '@/shared/lib/media/aspectRatios';

interface ImageWithMetadata {
  metadata?: {
    width?: number;
    height?: number;
    originalParams?: {
      orchestrator_details?: {
        resolution?: string;
      };
    };
  };
}

export function getImageAspectRatioStyle(
  image: ImageWithMetadata,
  projectAspectRatio?: string
): { aspectRatio: string } {
  let width = image.metadata?.width;
  let height = image.metadata?.height;

  if (!width || !height) {
    const resolution = image.metadata?.originalParams?.orchestrator_details?.resolution;
    if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
      const [w, h] = resolution.split('x').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        width = w;
        height = h;
      }
    }
  }

  if (width && height) {
    const aspectRatio = width / height;
    return { aspectRatio: `${aspectRatio}` };
  }

  return getProjectAspectRatioStyle(projectAspectRatio);
}

export function getProjectAspectRatioStyle(projectAspectRatio?: string): { aspectRatio: string } {
  if (projectAspectRatio) {
    const aspectRatio = parseRatio(projectAspectRatio);
    if (Number.isFinite(aspectRatio)) return { aspectRatio: `${aspectRatio}` };
  }

  return { aspectRatio: '1' };
}
