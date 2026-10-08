/**
 * High-volume timeline diagnostics are opt-in. The editor polls canonical
 * state in the background, so a normal development session must not turn each
 * poll/reconciliation phase into a console (or persisted-log) entry.
 *
 * Add `debugTimeline=1` to the editor URL when investigating the save/poll
 * protocol. Keeping this explicit also makes a noisy diagnostic session a
 * deliberate choice instead of an accidental property of DEV builds.
 */
export function isTimelineDiagnosticsEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debugTimeline') === '1';
}
