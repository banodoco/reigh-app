import { createRoot } from 'react-dom/client';
import { PublicAstridShell } from '@/pages/Home/PublicAstridShell.tsx';

export function renderPublicEntry(rootElement: HTMLElement): void {
  createRoot(rootElement).render(<PublicAstridShell />);
}
