const randomToken = (length: number): string =>
  Math.random().toString(36).slice(2, 2 + length);

const sanitizeExtension = (extension: string): string => {
  const normalized = extension.replace(/^\./, '').trim();
  return normalized.length > 0 ? normalized : 'bin';
};

export function generateUniqueFilename(extension: string): string {
  return `${Date.now()}-${randomToken(8)}.${sanitizeExtension(extension)}`;
}

export function generateThumbnailFilename(): string {
  return `thumb_${Date.now()}_${randomToken(6)}.jpg`;
}

export function getFileExtension(
  filename: string,
  mimeType?: string,
  defaultExt: string = 'bin'
): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts.pop()!;
  }

  if (mimeType) {
    const mimeExt = mimeType.split('/')[1]?.replace('jpeg', 'jpg');
    if (mimeExt) return mimeExt;
  }

  return defaultExt;
}

export const storagePaths = {
  upload: (userId: string, filename: string): string =>
    `${userId}/uploads/${filename}`,
  thumbnail: (userId: string, filename: string): string =>
    `${userId}/thumbnails/${filename}`,
  taskOutput: (userId: string, taskId: string, filename: string): string =>
    `${userId}/tasks/${taskId}/${filename}`,
  taskThumbnail: (userId: string, taskId: string, filename: string): string =>
    `${userId}/tasks/${taskId}/thumbnails/${filename}`,
};

export const MEDIA_BUCKET = 'image_uploads';
