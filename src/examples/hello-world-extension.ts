/**
 * hello-world-extension — Minimal extension example using @astrid/editor-sdk.
 *
 * Demonstrates the simplest valid extension: a manifest-only declaration
 * with no contributions or activate function.
 *
 * This file must NOT import from editor internals (src/tools/video-editor/*).
 * It imports exclusively from @astrid/editor-sdk, the public SDK entrypoint.
 */

import { defineExtension } from '@astrid/editor-sdk';
import type { AstridExtension } from '@astrid/editor-sdk';

export const helloWorldExtension: AstridExtension = defineExtension({
  manifest: {
    id: 'haus.astrid.examples.hello-world' as any,
    version: '1.0.0',
    label: 'Hello World Extension',
    description: 'A minimal extension that demonstrates SDK usage.',
    apiVersion: 1,
  },
});
