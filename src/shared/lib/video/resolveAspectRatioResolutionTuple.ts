import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';

export function resolveAspectRatioResolutionTuple(
  projectAspectRatio: string | undefined,
): [number, number] | undefined {
  if (!projectAspectRatio) return undefined;

  const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
  if (!resolutionStr) return undefined;

  const [width, height] = resolutionStr.split('x').map(Number);
  if (!width || !height) return undefined;

  return [width, height];
}
