import React from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { uploadVideoToStorage } from '@/shared/lib/media/videoUploader';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface AddAudioButtonProps {
  projectId?: string;
  shotId: string;
  onAudioChange: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null
  ) => void;
}

/** Centered "Add Audio" button in the top controls area */
export const AddAudioButton: React.FC<AddAudioButtonProps> = ({
  projectId: _projectId,
  shotId: _shotId,
  onAudioChange,
}) => {
  return (
    <label className="absolute left-1/2 -translate-x-1/2 cursor-pointer pointer-events-auto">
      <input
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const audio = new Audio();
            const tempUrl = URL.createObjectURL(file);
            audio.src = tempUrl;
            await new Promise<void>((resolve, reject) => {
              audio.addEventListener('loadedmetadata', () => resolve());
              audio.addEventListener('error', () => reject(new Error('Failed to load audio')));
            });
            const uploadedUrl = await uploadVideoToStorage(file);
            URL.revokeObjectURL(tempUrl);
            onAudioChange(uploadedUrl, { duration: audio.duration, name: file.name });
            e.target.value = '';
          } catch (error) {
            normalizeAndPresentError(error, { context: 'AddAudioButton.upload' });
            toast.error('Failed to upload audio');
          }
        }}
      />
      <span className="text-xs text-muted-foreground hover:text-foreground">Add Audio</span>
    </label>
  );
};
