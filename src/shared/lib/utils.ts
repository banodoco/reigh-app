import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cropFilename(filename: string, maxLength: number = 24): string {
  if (filename.length <= maxLength) {
    return filename;
  }

  const extension = filename.split('.').pop() || '';
  const nameWithoutExtension = filename.substring(0, filename.length - extension.length - 1);
  const croppedLength = maxLength - extension.length - 4;

  if (croppedLength <= 0) {
    return `...${extension}`;
  }

  return `${nameWithoutExtension.substring(0, croppedLength)}...${extension}`;
}

export function formatTime(
  seconds: number,
  options: { showMilliseconds?: boolean; millisecondsDigits?: 1 | 2 | 3 } = {}
): string {
  const { showMilliseconds = false, millisecondsDigits = 1 } = options;

  if (!Number.isFinite(seconds) || seconds < 0) {
    return showMilliseconds ? '0:00.0' : '0:00';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const base = `${mins}:${secs.toString().padStart(2, '0')}`;

  if (!showMilliseconds) {
    return base;
  }

  const divisor = Math.pow(10, 3 - millisecondsDigits);
  const ms = Math.floor((seconds % 1) * 1000 / divisor);
  return `${base}.${ms.toString().padStart(millisecondsDigits, '0')}`;
}
