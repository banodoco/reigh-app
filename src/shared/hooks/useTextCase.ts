import { useEffect } from 'react';
import usePersistentState from './usePersistentState';

const PRESERVE_USER_TEXT_CLASS = 'preserve-user-text';
let preserveUserTextClassConsumers = 0;

function acquirePreserveUserTextClass(): void {
  if (typeof document === 'undefined') {
    return;
  }
  preserveUserTextClassConsumers += 1;
  if (preserveUserTextClassConsumers === 1) {
    document.documentElement.classList.add(PRESERVE_USER_TEXT_CLASS);
  }
}

function releasePreserveUserTextClass(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (preserveUserTextClassConsumers === 0) {
    document.documentElement.classList.remove(PRESERVE_USER_TEXT_CLASS);
    return;
  }
  preserveUserTextClassConsumers -= 1;
  if (preserveUserTextClassConsumers === 0) {
    document.documentElement.classList.remove(PRESERVE_USER_TEXT_CLASS);
  }
}

/**
 * Hook to manage whether user-inputted text preserves its original casing.
 *
 * UI text is ALWAYS lowercase for aesthetic consistency.
 * This setting controls whether user-inputted text (project names, shot names,
 * prompts, etc.) is also lowercased or preserves its original case.
 *
 * - Default (false): All text lowercase, including user inputs
 * - Enabled (true): User-inputted text preserves original case via .preserve-case
 */
export function useTextCase() {
  const [preserveUserText, setPreserveUserText] = usePersistentState<boolean>('preserve-user-text', false);

  useEffect(() => {
    if (!preserveUserText) {
      return;
    }
    acquirePreserveUserTextClass();

    return () => {
      releasePreserveUserTextClass();
    };
  }, [preserveUserText]);

  const toggle = () => setPreserveUserText((prev) => !prev);

  return { preserveUserText, setPreserveUserText, toggle };
}
