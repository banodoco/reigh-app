import { extractVideoMetadataFromUrl } from '@/shared/lib/videoUploader';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { ApplyContext, ApplyResult, ExtractedSettings, TaskData } from './types';

export const applyLoRAs = (
  settings: ExtractedSettings,
  context: ApplyContext,
): Promise<ApplyResult> => {
  const loras = settings.loras;

  // Only apply if NOT in advanced mode
  if (loras === undefined || settings.advancedMode) {
    return Promise.resolve({ success: true, settingName: 'loras', details: 'skipped' });
  }

  if (loras.length > 0) {
    // Clear existing LoRAs first
    if (context.loraManager.setSelectedLoras) {
      context.loraManager.setSelectedLoras([]);
    }

    // Map paths to available LoRAs and restore them (with delay to ensure state is cleared)
    return new Promise((resolve) => {
      setTimeout(() => {
        let matchedCount = 0;

        loras.forEach((loraData) => {
          const matchingLora = context.availableLoras.find(lora => {
            const legacyDownloadLink = (lora as Record<string, unknown>)['Download Link'];
            const loraUrl = lora.huggingface_url ?? (typeof legacyDownloadLink === 'string' ? legacyDownloadLink : '');
            return loraUrl === loraData.path ||
              loraUrl.endsWith(loraData.path) ||
              loraData.path.endsWith(loraUrl.split('/').pop() || '');
          });

          if (matchingLora) {
            context.loraManager.handleAddLora(matchingLora, false, loraData.strength);
            matchedCount++;
          }
        });

        resolve({ success: true, settingName: 'loras', details: `${matchedCount}/${loras.length} matched` });
      }, 100); // Small delay to ensure state clears
    });
  }

  if (context.loraManager.setSelectedLoras) {
    context.loraManager.setSelectedLoras([]);
  }
  return Promise.resolve({ success: true, settingName: 'loras', details: 'cleared' });
};

export const applyStructureVideo = async (
  settings: ExtractedSettings,
  context: ApplyContext,
  taskData: TaskData,
): Promise<ApplyResult> => {
  const hasStructureVideos = Array.isArray((taskData.orchestrator as Record<string, unknown>).structure_videos)
    || Array.isArray((taskData.params as Record<string, unknown>).structure_videos);
  const hasLegacyStructureVideo = 'structure_video_path' in taskData.orchestrator || 'structure_video_path' in taskData.params;
  const hasGuidanceVideos =
    Array.isArray(((taskData.orchestrator as Record<string, unknown>).structure_guidance as Record<string, unknown> | undefined)?.videos) ||
    Array.isArray(((taskData.params as Record<string, unknown>).structure_guidance as Record<string, unknown> | undefined)?.videos);
  const hasStructureVideoInTask = hasStructureVideos || hasLegacyStructureVideo || hasGuidanceVideos;

  if (!hasStructureVideoInTask) {
    return { success: true, settingName: 'structureVideo', details: 'skipped - not in task' };
  }

  const firstStructureVideo = settings.structureVideos?.[0];
  const structureVideoPath = firstStructureVideo?.path ?? settings.structureVideoPath;

  if (!structureVideoPath) {
    if (context.onStructureVideoInputChange) {
      context.onStructureVideoInputChange(null, null, 'adjust', 1.0, 'uni3c');
    }
    return { success: true, settingName: 'structureVideo', details: 'cleared' };
  }

  if (!context.onStructureVideoInputChange) {
    normalizeAndPresentError(new Error('onStructureVideoInputChange is not defined'), {
      context: 'ApplySettings.applyStructureVideo',
      showToast: false,
    });
    return { success: false, settingName: 'structureVideo', error: 'handler not defined' };
  }

  try {
    let metadata = null;
    try {
      metadata = firstStructureVideo?.metadata ?? await extractVideoMetadataFromUrl(structureVideoPath);
    } catch {
      // Metadata extraction is optional for restore flow.
    }

    context.onStructureVideoInputChange(
      structureVideoPath,
      metadata,
      firstStructureVideo?.treatment ?? (settings.structureVideoTreatment || 'adjust'),
      firstStructureVideo?.motion_strength ?? settings.structureVideoMotionStrength ?? 1.0,
      firstStructureVideo?.structure_type ?? (settings.structureVideoType || 'uni3c'),
    );

    return { success: true, settingName: 'structureVideo' };
  } catch (error) {
    const appError = normalizeAndPresentError(error, {
      context: 'ApplySettings.applyStructureVideo',
      showToast: false,
    });
    return { success: false, settingName: 'structureVideo', error: appError.message };
  }
};
