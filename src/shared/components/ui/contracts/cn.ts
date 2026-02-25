import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** @uiContract Classname merge helper for UI primitives. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
