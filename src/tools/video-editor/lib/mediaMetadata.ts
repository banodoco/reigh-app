import { extractVideoMetadata } from '@/shared/lib/media/videoMetadata';
import type { AssetRegistryEntry } from '@/tools/video-editor/types';

function loadImageMetadata(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image metadata'));
    };
    image.src = url;
  });
}

function loadAudioMetadata(file: File): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve({ duration: audio.duration });
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio metadata'));
    };
    audio.src = url;
  });
}

export async function extractAssetRegistryEntry(
  file: File,
  storagePath: string,
): Promise<AssetRegistryEntry> {
  if (file.type.startsWith('video/')) {
    const metadata = await extractVideoMetadata(file);
    return {
      file: storagePath,
      type: file.type,
      duration: metadata.duration_seconds,
      resolution: `${metadata.width}x${metadata.height}`,
      fps: metadata.frame_rate,
    };
  }

  if (file.type.startsWith('image/')) {
    const metadata = await loadImageMetadata(file);
    return {
      file: storagePath,
      type: file.type,
      resolution: `${metadata.width}x${metadata.height}`,
    };
  }

  if (file.type.startsWith('audio/')) {
    const metadata = await loadAudioMetadata(file);
    return {
      file: storagePath,
      type: file.type,
      duration: metadata.duration,
    };
  }

  return {
    file: storagePath,
    type: file.type || 'application/octet-stream',
  };
}
