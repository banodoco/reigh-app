import React from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { uploadVideoToStorage } from '@/shared/lib/videoUploader';

export interface AddAudioButtonProps {
  projectId?: string;
  shotId: string;
  onAudioChange: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null
  ) => void;
}

/** Centered "Add Audio" button in the top controls area */
export const AddAudioButton: React.FC<AddAudioButtonProps> = ({
  projectId,
  shotId,
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
            const uploadedUrl = await uploadVideoToStorage(file, projectId!, shotId);
            URL.revokeObjectURL(tempUrl);
            onAudioChange(uploadedUrl, { duration: audio.duration, name: file.name });
            e.target.value = '';
          } catch (error) {
            console.error('Error uploading audio:', error);
            toast.error('Failed to upload audio');
          }
        }}
      />
      <span className="text-xs text-muted-foreground hover:text-foreground">Add Audio</span>
    </label>
  );
};
