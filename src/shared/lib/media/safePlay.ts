import { reportRecoverableError } from '@/shared/lib/errorHandling/recoverableError';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';

export async function safePlay(
  video: HTMLVideoElement,
  context: string,
  logData?: Record<string, unknown>,
): Promise<OperationResult<void>> {
  try {
    await video.play();
    return operationSuccess(undefined, { policy: 'best_effort' });
  } catch (error) {
    reportRecoverableError(error, { context, logData });
    return operationFailure(error, {
      errorCode: 'video_playback_failed',
      policy: 'degrade',
      recoverable: true,
      message: 'Video playback could not start.',
      cause: { context, logData },
    });
  }
}
