const IMAGE_FILE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

export function getFirstFile(files: FileList | null | undefined): File | null {
  return files?.item(0) ?? null;
}

export async function withFirstFile(
  files: FileList | null | undefined,
  handler: (file: File) => Promise<void> | void
): Promise<void> {
  const file = getFirstFile(files);
  if (!file) {
    return;
  }

  await handler(file);
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
