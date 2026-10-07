import { createContext, useContext, type ReactNode } from 'react';
import type { VideoEditorEffectCatalog } from '@/tools/video-editor/lib/effect-catalog.ts';
import type { VideoEditorSequenceComponentCatalog } from '@/tools/video-editor/lib/sequence-component-catalog.ts';

const EffectCatalogContext = createContext<VideoEditorEffectCatalog | null>(null);
const SequenceCatalogContext = createContext<VideoEditorSequenceComponentCatalog | null>(null);

export function EffectCatalogProvider({value, children}: {value: VideoEditorEffectCatalog; children: ReactNode}) {
  return <EffectCatalogContext.Provider value={value}>{children}</EffectCatalogContext.Provider>;
}

export function SequenceComponentCatalogProvider({value, children}: {value: VideoEditorSequenceComponentCatalog; children: ReactNode}) {
  return <SequenceCatalogContext.Provider value={value}>{children}</SequenceCatalogContext.Provider>;
}

export function useOptionalEffectCatalog(): VideoEditorEffectCatalog | null {
  return useContext(EffectCatalogContext);
}

export function useOptionalSequenceComponentCatalog(): VideoEditorSequenceComponentCatalog | null {
  return useContext(SequenceCatalogContext);
}

export function useRequiredEffectCatalog(): VideoEditorEffectCatalog {
  const catalog = useOptionalEffectCatalog();
  if (!catalog) throw new Error('Effect catalog requires a host provider.');
  return catalog;
}

export function useRequiredSequenceComponentCatalog(): VideoEditorSequenceComponentCatalog {
  const catalog = useOptionalSequenceComponentCatalog();
  if (!catalog) throw new Error('Sequence catalog requires a host provider.');
  return catalog;
}
