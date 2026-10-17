/**
 * Pack-authored editor extensions admitted by Astrid's generated catalog.
 *
 * `VideoEditorPage` applies deployment-owned release flags before activating
 * these entries in production. DEV honors the Extension Manager's local
 * disabled-ID store. Host-only smoke checks remain separate from this catalog.
 */
import type { AstridExtension } from '@astrid/editor-sdk';
import { ASTRID_EDITOR_EXTENSIONS } from '@astrid/packs/rendering/editor/catalog';

export const devLocalExtensions: AstridExtension[] = [...ASTRID_EDITOR_EXTENSIONS];
