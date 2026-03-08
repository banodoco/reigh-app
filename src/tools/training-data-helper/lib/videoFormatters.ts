const BYTES_PER_KB = 1024;

export function formatDurationMinutesSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_KB));
  return parseFloat((bytes / Math.pow(BYTES_PER_KB, unitIndex)).toFixed(2)) + ' ' + sizes[unitIndex];
}
