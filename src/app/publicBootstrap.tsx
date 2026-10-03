import { createRoot } from 'react-dom/client';
import { followIntoInstalledApp } from '@/app/entryClassification.ts';
import { PublicAstridSite } from '@/pages/Home/PublicAstridSite.tsx';
import '@/index.css';

export function renderPublicEntry(rootElement: HTMLElement): void {
  followIntoInstalledApp();
  createRoot(rootElement).render(<PublicAstridSite />);
}
