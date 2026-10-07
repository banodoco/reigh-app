import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, Copy } from 'lucide-react';
import { PublicAstridInstallDialog } from './PublicAstridInstallDialog';
import { PixelCheckIcon, PixelCopyIcon } from './PublicAstridPixelIcons';
import type { PublicAstridAudience } from './publicAstridMotion';

// Placeholder until the agent has a published installer; replace with the real one-line install.
const AGENT_INSTALL_COMMAND = 'git clone https://github.com/banodoco/reigh-app.git';

function AgentInstallCommand({ active, pixelIcons }: { active: boolean; pixelIcons: boolean }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  const requestRef = useRef(0);

  const clearReset = useCallback(() => {
    if (resetRef.current !== null) {
      window.clearTimeout(resetRef.current);
      resetRef.current = null;
    }
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      requestRef.current += 1;
      clearReset();
      setCopied(false);
    }
  }, [active, clearReset]);

  useEffect(() => () => {
    activeRef.current = false;
    requestRef.current += 1;
    clearReset();
  }, [clearReset]);

  const copy = async () => {
    if (!activeRef.current || !navigator.clipboard?.writeText) return;
    const request = ++requestRef.current;
    try {
      await navigator.clipboard.writeText(AGENT_INSTALL_COMMAND);
    } catch {
      return;
    }
    if (!activeRef.current || request !== requestRef.current) return;
    setCopied(true);
    clearReset();
    resetRef.current = window.setTimeout(() => {
      if (activeRef.current && request === requestRef.current) setCopied(false);
      resetRef.current = null;
    }, 1_800);
  };
  return (
    <button
      className="astrid-button astrid-install-command"
      type="button"
      data-active={active}
      aria-hidden={!active}
      tabIndex={active ? undefined : -1}
      onClick={copy}
      aria-label={copied ? 'Install command copied' : `Copy install command: ${AGENT_INSTALL_COMMAND}`}
    >
      <code><span aria-hidden="true">$ </span>{AGENT_INSTALL_COMMAND}</code>
      {pixelIcons
        ? (copied ? <PixelCheckIcon /> : <PixelCopyIcon />)
        : (copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />)}
      <span className="astrid-visually-hidden" role="status">{copied ? 'Copied' : ''}</span>
    </button>
  );
}

/**
 * The hero's main call to action follows the audience: install the app, or copy the agent install.
 * Both stay mounted in one grid cell so a switch crossfades between them instead of swapping.
 */
export function PublicAstridHeroCta({ audience, pixelIcons = false, active = true }: { audience: PublicAstridAudience; pixelIcons?: boolean; active?: boolean }) {
  const appActive = audience === 'app';
  const [installOpen, setInstallOpen] = useState(false);
  useEffect(() => { if (!active) setInstallOpen(false); }, [active]);
  return (
    <>
      <div className="astrid-hero-cta">
        <button
          className="astrid-button astrid-button-primary"
          type="button"
          data-active={appActive && active}
          aria-hidden={!appActive || !active}
          aria-haspopup="dialog"
          tabIndex={appActive && active ? undefined : -1}
          onClick={() => setInstallOpen(true)}
        >
          <span>Install Astrid</span>
          {/* The app button keeps its smooth icon to match its label; pixel icons belong with the pixel-type git line. */}
          <ArrowDownToLine size={17} aria-hidden="true" />
        </button>
        <AgentInstallCommand active={!appActive && active} pixelIcons={pixelIcons} />
      </div>
      {/* Outside the crossfade grid, which stacks every child in one cell. */}
      <PublicAstridInstallDialog open={installOpen && active} onClose={() => setInstallOpen(false)} />
    </>
  );
}
