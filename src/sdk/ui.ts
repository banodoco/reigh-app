/**
 * UI renderer contracts for the Astrid Editor SDK.
 *
 * Hosts the generic {@link ExtensionRenderer} type and the {@link ExtensionUiService}
 * exposed as `ctx.ui` during extension activation. Render-backed contributions
 * (e.g. `timelineOverlay`) declare a required `render` id in the manifest and
 * bind the matching renderer imperatively via `ui.registerRenderer()`.
 *
 * This module contains only data-only types and read-only surfaces; no
 * registry, provider, resolver, DOM, or React behaviour lives here.
 *
 * @publicContract
 */

import type { DisposeHandle } from './dispose';
import type { TimelineViewStore } from './video/timeline/viewState';
import type { TranscriptPanelAdapter } from './video/transcript';

/** Optional video context; a generic panel needs neither playback nor a lane. */
export interface PanelVideoAdapter {
  readonly view: TimelineViewStore;
  readonly transcript?: TranscriptPanelAdapter;
  /** Seek through the host player. The adapter owns validation/projection. */
  seek(seconds: number): void;
}

/** Props supplied to a registered trusted React panel renderer. */
export interface PanelRenderProps {
  /** Host-controlled extension settings surface, when supplied by the dock. */
  readonly settings?: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void };
  /** Stable for this contribution in this mounted host, distinct between hosts. */
  readonly instanceId: string;
  /** Hidden panels remain mounted; suspend observations while false. */
  readonly visible: boolean;
  readonly video?: PanelVideoAdapter;
}

/**
 * A renderer function registered by an extension and invoked by the host
 * with host-owned props.
 *
 * `Props` is the render-time props contract owned by the consuming family
 * (e.g. {@link TimelineOverlayRenderProps} for `timelineOverlay`). Renderers
 * are trusted local code; the return value is rendered by the host surface
 * (a React node for host React surfaces).
 */
export type ExtensionRenderer<Props> = (props: Props) => unknown;

/**
 * UI service available as `ctx.ui` during activate().
 *
 * Exposes only renderer registration. Extensions declare render-backed
 * contributions in their manifest (a required `render` id) and bind the
 * matching renderer imperatively via `registerRenderer()`. The returned
 * {@link DisposeHandle} unregisters the renderer on dispose.
 *
 * No other UI surface is exposed: chrome chrome/slot placement, dialogs,
 * and panels are governed by their own manifest contributions and services.
 */
export interface ExtensionUiService {
  /**
   * Register a renderer for a render-backed contribution.
   *
   * The `renderId` must match the `render` field of a contribution declared
   * by this extension in its manifest (e.g. a `timelineOverlay` contribution).
   *
   * Returns a DisposeHandle that unregisters the renderer when dispose() is
   * called (safe to call multiple times; idempotent).
   */
  registerRenderer<Props>(
    renderId: string,
    renderer: ExtensionRenderer<Props>,
  ): DisposeHandle;
}
