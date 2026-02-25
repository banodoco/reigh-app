export function cropFilename(filename: string, maxLength: number = 24): string {
  if (maxLength <= 0) {
    return '';
  }

  if (filename.length <= maxLength) {
    return filename;
  }

  const lastDotIndex = filename.lastIndexOf('.');
  const hasExtension = lastDotIndex > 0 && lastDotIndex < filename.length - 1;

  if (!hasExtension) {
    const croppedLength = Math.max(1, maxLength - 3);
    return `${filename.substring(0, croppedLength)}...`;
  }

  const extensionWithDot = filename.substring(lastDotIndex);
  const nameWithoutExtension = filename.substring(0, lastDotIndex);
  const croppedLength = maxLength - extensionWithDot.length - 3;

  if (croppedLength <= 0) {
    return `...${extensionWithDot}`.substring(0, maxLength);
  }

  return `${nameWithoutExtension.substring(0, croppedLength)}...${extensionWithDot}`;
}

export function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return '.'.repeat(maxLength);
  }

  return `${text.slice(0, maxLength - 3)}...`;
}
