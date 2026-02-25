import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { DEFAULT_RESOLUTION } from '../../utils/dimension-utils';
import type { Shot } from '@/domains/generation/types/shotViewRow';

export function resolveGenerationResolution(selectedShot: Shot, effectiveAspectRatio: string | null): string {
  if (selectedShot?.aspect_ratio) {
    const shotResolution = ASPECT_RATIO_TO_RESOLUTION[selectedShot.aspect_ratio];
    if (shotResolution) return shotResolution;
  }

  if (effectiveAspectRatio) {
    const projectResolution = ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio];
    if (projectResolution) return projectResolution;
  }

  return DEFAULT_RESOLUTION;
}
