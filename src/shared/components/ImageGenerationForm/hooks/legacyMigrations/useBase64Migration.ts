import { useEffect } from 'react';
import { dataURLtoFile } from '@/shared/lib/fileConversion';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { LegacyMigrationsInput } from './types';

type Base64MigrationInput = Pick<
  LegacyMigrationsInput,
  'rawStyleReferenceImage' | 'selectedProjectId' | 'updateProjectImageSettings'
>;

export function useBase64Migration(input: Base64MigrationInput): void {
  const {
    rawStyleReferenceImage,
    selectedProjectId,
    updateProjectImageSettings,
  } = input;

  useEffect(() => {
    const migrateBase64ToUrl = async () => {
      if (
        !rawStyleReferenceImage ||
        !rawStyleReferenceImage.startsWith('data:image/') ||
        !selectedProjectId
      ) {
        return;
      }

      try {
        const file = dataURLtoFile(
          rawStyleReferenceImage,
          `migrated-style-reference-${Date.now()}.png`
        );

        if (!file) {
          console.error('[ImageGenerationForm] Failed to convert base64 to file for migration');
          return;
        }

        const uploadedUrl = await uploadImageToStorage(file);

        await updateProjectImageSettings('project', {
          styleReferenceImage: uploadedUrl,
          styleReferenceImageOriginal: uploadedUrl,
        });
      } catch (error) {
        handleError(error, {
          context: 'ImageGenerationForm.migrateBase64ToUrl',
          toastTitle: 'Failed to migrate style reference image',
        });
      }
    };

    void migrateBase64ToUrl();
  }, [rawStyleReferenceImage, selectedProjectId, updateProjectImageSettings]);
}
