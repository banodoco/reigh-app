import type { AppError } from './errors';

export interface ErrorNotificationPayload {
  appError: AppError;
  title: string;
  description: string;
}

export type ErrorNotifier = (payload: ErrorNotificationPayload) => void;
export type ErrorNotifierState = 'configured' | 'unconfigured';

interface ErrorNotifierRegistration {
  notifier: ErrorNotifier;
  owner: string;
}

let registration: ErrorNotifierRegistration | null = null;

export function installErrorNotifier(notifier: ErrorNotifier, owner: string): void {
  if (registration) {
    if (registration.owner === owner) {
      registration = { notifier, owner };
      return;
    }

    console.warn(
      `[error-notifier] Ignored registration from "${owner}" because notifier is already owned by "${registration.owner}".`,
    );
    return;
  }

  registration = { notifier, owner };
}

export function resetErrorNotifierForTests(): void {
  registration = null;
}

export function isErrorNotifierConfigured(): boolean {
  return registration !== null;
}

export function getErrorNotifierState(): ErrorNotifierState {
  return isErrorNotifierConfigured() ? 'configured' : 'unconfigured';
}

export function emitErrorNotification(payload: ErrorNotificationPayload): boolean {
  if (!registration) {
    return false;
  }

  registration.notifier(payload);
  return true;
}
