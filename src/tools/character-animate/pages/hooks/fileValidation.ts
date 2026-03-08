const IMAGE_FILE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

export function getFirstFile(files: FileList | null | undefined): File | null {
  return files?.item(0) ?? null;
}

export function isSupportedImageType(mimeType: string): boolean {
  return IMAGE_FILE_MIME_TYPES.has(mimeType);
}

export function isSupportedVideoType(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

export function hasSupportedImageItem(items: DataTransferItemList): boolean {
  return Array.from(items).some((item) => (
    item.kind === 'file' && isSupportedImageType(item.type)
  ));
}

export function hasSupportedVideoItem(items: DataTransferItemList): boolean {
  return Array.from(items).some((item) => (
    item.kind === 'file' && isSupportedVideoType(item.type)
  ));
}
