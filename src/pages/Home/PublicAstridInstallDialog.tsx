import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Link2, Monitor, Share, X } from 'lucide-react';
import {
  APP_ENTRY_PATH,
  rememberAppEntryPreference,
} from '@/app/entryClassification.ts';
import {
  detectBrowser,
  detectDeviceType,
  detectPlatform,
  detectSafariPwaSupport,
  isDesktopPlatform,
} from '@/shared/hooks/platformInstall/platformDetection';
import { useInstallPromptSignals } from '@/shared/hooks/platformInstall/signals';
import './PublicAstridInstallDialog.css';

const AVATAR_SRC = '/astrid-app-icon-192.png';
const HOME_PATH = '/home';

/** Which explainer to show: each browser installs from a different spot, and phones can't yet. */
type InstallScenario = 'chromium' | 'safari' | 'unsupported' | 'mobile';

function detectInstallScenario(): InstallScenario {
  const platform = detectPlatform();
  const browser = detectBrowser();
  if (detectDeviceType(platform) !== 'desktop' || !isDesktopPlatform(platform)) return 'mobile';
  if (browser === 'chrome' || browser === 'edge') return 'chromium';
  if (detectSafariPwaSupport(browser, platform)) return 'safari';
  return 'unsupported';
}

function useInstallScenario(): InstallScenario {
  return useMemo(detectInstallScenario, []);
}

function useBrowserInstall() {
  const { deferredPrompt, isAppInstalled, setDeferredPrompt, setPromptConsumed } = useInstallPromptSignals();
  // Installing from anywhere (the address bar included, not just this dialog) sends later visits
  // straight into the app.
  useEffect(() => {
    if (isAppInstalled) rememberAppEntryPreference();
  }, [isAppInstalled]);
  const promptInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') rememberAppEntryPreference();
    } finally {
      setDeferredPrompt(null);
      setPromptConsumed(true);
    }
  };
  return { canPrompt: Boolean(deferredPrompt), installed: isAppInstalled, promptInstall };
}

function openInBrowser() {
  rememberAppEntryPreference();
  window.location.assign(APP_ENTRY_PATH);
}

/** How far the arrow climbs towards the toolbar. It points the general way, up and to the right. */
const POINTER_RISE = 150;
const POINTER_REACH = 96;

interface PointerGeometry { width: number; height: number; line: string; head: string; labelX: number; labelY: number }

/** A curve from the card's top-right, heading up and to the right, with an arrowhead along its last direction. */
function pointerGeometry(card: DOMRect): PointerGeometry {
  const width = window.innerWidth;
  const sx = card.right - 64;
  const sy = card.top - 10;
  const ex = sx + POINTER_REACH;
  const ey = Math.max(16, sy - POINTER_RISE);
  const c1x = sx;
  const c1y = sy - (sy - ey) * 0.55;
  const c2x = ex - (ex - sx) * 0.4;
  const c2y = ey + (sy - ey) * 0.28;
  const length = Math.hypot(ex - c2x, ey - c2y) || 1;
  const [dx, dy] = [(ex - c2x) / length, (ey - c2y) / length];
  const barb = (angle: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return `${(ex - 12 * (dx * cos - dy * sin)).toFixed(1)} ${(ey - 12 * (dx * sin + dy * cos)).toFixed(1)}`;
  };
  return {
    width,
    height: window.innerHeight,
    line: `M${sx} ${sy}C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`,
    head: `M${barb(0.5)}L${ex} ${ey}L${barb(-0.5)}`,
    labelX: sx - 12,
    labelY: sy - 4,
  };
}

/**
 * The arrow leaves the card towards the browser's toolbar, so it is drawn across the whole viewport
 * and redrawn whenever the window or the card moves.
 */
function ToolbarPointer({ open, label }: { open: boolean; label: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<PointerGeometry | null>(null);
  useEffect(() => {
    const card = svgRef.current?.parentElement;
    if (!open || !card) return;
    const measure = () => setGeometry(pointerGeometry(card.getBoundingClientRect()));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open]);
  return (
    <svg
      ref={svgRef}
      className="astrid-install-pointer"
      aria-hidden="true"
      width={geometry?.width}
      height={geometry?.height}
      fill="none"
    >
      {geometry ? (
        <>
          <path className="astrid-install-pointer-line" d={geometry.line} pathLength={1} />
          <path className="astrid-install-pointer-head" d={geometry.head} />
          <text className="astrid-install-pointer-label" x={geometry.labelX} y={geometry.labelY} textAnchor="end">{label.toUpperCase()}</text>
        </>
      ) : null}
    </svg>
  );
}

/** A little window mock: the address bar's install icon pulses, is clicked, and offers Install. */
function ChromiumVisual() {
  return (
    <div className="astrid-install-visual" data-scenario="chromium" aria-hidden="true">
      <div className="astrid-install-window">
        <div className="astrid-install-toolbar">
          <span className="astrid-install-lights"><i /><i /><i /></span>
          <span className="astrid-install-omnibox">
            <span className="astrid-install-url">astrid</span>
            <span className="astrid-install-target astrid-install-target-chromium">
              <Monitor size={11} strokeWidth={2.2} />
              <ArrowRight className="astrid-install-target-arrow" size={7} strokeWidth={3} />
            </span>
          </span>
          <span className="astrid-install-menu"><i /><i /><i /></span>
        </div>
        <div className="astrid-install-page"><i /><i /><i /></div>
        <div className="astrid-install-popover">
          <span className="astrid-install-popover-title">Install app?</span>
          <span className="astrid-install-popover-app">
            <img src={AVATAR_SRC} alt="" />
            <span>Astrid</span>
          </span>
          <span className="astrid-install-popover-actions">
            <span>Cancel</span>
            <span className="astrid-install-popover-confirm">Install</span>
          </span>
        </div>
        <span className="astrid-install-cursor" />
      </div>
    </div>
  );
}

/** Safari (17+): the Share button, then Add to Dock. */
function SafariVisual() {
  return (
    <div className="astrid-install-visual" data-scenario="safari" aria-hidden="true">
      <div className="astrid-install-window">
        <div className="astrid-install-toolbar">
          <span className="astrid-install-lights"><i /><i /><i /></span>
          <span className="astrid-install-omnibox astrid-install-omnibox-centred">
            <span className="astrid-install-url">astrid</span>
          </span>
          <span className="astrid-install-target astrid-install-target-safari"><Share size={11} strokeWidth={2.2} /></span>
        </div>
        <div className="astrid-install-page"><i /><i /><i /></div>
        <div className="astrid-install-popover astrid-install-share-menu">
          <span>Copy</span>
          <span>Add to Reading List</span>
          <span className="astrid-install-popover-confirm">Add to Dock…</span>
        </div>
        <span className="astrid-install-cursor" />
      </div>
    </div>
  );
}

const DESKTOP_COPY: Record<Exclude<InstallScenario, 'mobile'>, { lede: string; steps: string[] }> = {
  chromium: {
    lede: 'Astrid installs straight from your browser, into its own window and your dock.',
    steps: ['Click the install icon at the right end of the address bar, up here.', 'Choose Install.'],
  },
  safari: {
    lede: 'Astrid installs straight from Safari, into its own window and your dock.',
    steps: ['Click the Share button in the top-right of the toolbar.', 'Choose Add to Dock.'],
  },
  unsupported: {
    lede: 'This browser can’t install web apps. Open this page in Chrome, Edge or Safari to install Astrid, or use it right here.',
    steps: [],
  },
};

function MobileContent({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const sendToComputer = async () => {
    const url = new URL(HOME_PATH, window.location.origin).href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Astrid', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // The person dismissed the share sheet, or the clipboard is unavailable: nothing to do.
    }
  };
  return (
    <>
      <div className="astrid-install-desk" aria-hidden="true">
        <span className="astrid-install-desk-phone" />
        <ArrowRight className="astrid-install-desk-arrow" size={18} strokeWidth={2.2} />
        <span className="astrid-install-desk-laptop"><span /></span>
      </div>
      <p className="astrid-install-lede">
        Astrid is made for a computer for now. Open this page in Chrome, Edge or Safari on your desktop to install it.
      </p>
      <div className="astrid-install-actions">
        <button type="button" className="astrid-button astrid-button-primary" onClick={sendToComputer}>
          <span>{copied ? 'Link copied' : 'Send the link to your computer'}</span>
          {copied ? <Check size={17} aria-hidden="true" /> : <Link2 size={17} aria-hidden="true" />}
        </button>
        <button type="button" className="astrid-install-quiet" onClick={onClose}>Not now</button>
      </div>
    </>
  );
}

/**
 * The landing page's install flow: a visual explainer for installing Astrid as an app from the
 * browser, anchored in the top-right corner where the browser's install control lives, with the
 * option to use it right here instead. Either choice makes the site open straight into the app on
 * later visits; /home keeps the landing page.
 */
export function PublicAstridInstallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scenario = useInstallScenario();
  const { canPrompt, installed, promptInstall } = useBrowserInstall();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const desktop = scenario !== 'mobile';
  const copy = desktop ? DESKTOP_COPY[scenario] : null;
  const pointsUp = scenario === 'chromium' || scenario === 'safari';

  return (
    <dialog
      ref={dialogRef}
      className="astrid-install-dialog"
      data-scenario={scenario}
      data-points-up={pointsUp && !installed ? '' : undefined}
      aria-labelledby="astrid-install-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself, outside its card) dismisses it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="astrid-install-card">
        {pointsUp && !installed ? (
          <ToolbarPointer open={open} label={scenario === 'safari' ? 'Share, up here' : 'Up here'} />
        ) : null}
        <button type="button" className="astrid-install-close" onClick={onClose} aria-label="Close">
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <header className="astrid-install-header">
          <img className="astrid-install-avatar" src={AVATAR_SRC} alt="" />
          <div>
            <h2 id="astrid-install-title">{installed ? 'Astrid is installed' : 'Install Astrid'}</h2>
            <p>{desktop ? (installed ? 'Open it from your dock or apps.' : 'The app, one click from your dock.') : 'Desktop only, for now'}</p>
          </div>
        </header>

        {!desktop ? <MobileContent onClose={onClose} /> : null}

        {desktop && copy ? (
          <>
            {installed ? null : (
              <div className="astrid-install-body">
                {scenario === 'chromium' ? <ChromiumVisual /> : null}
                {scenario === 'safari' ? <SafariVisual /> : null}
                <div className="astrid-install-guide">
                  <p className="astrid-install-lede">{copy.lede}</p>
                  {copy.steps.length ? (
                    <ol className="astrid-install-steps">
                      {copy.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  ) : null}
                </div>
              </div>
            )}
            <div className="astrid-install-actions">
              {canPrompt && !installed ? (
                <button type="button" className="astrid-button astrid-button-primary" onClick={promptInstall}>
                  <span>Install now</span>
                  <Monitor size={17} aria-hidden="true" />
                </button>
              ) : null}
              <button type="button" className="astrid-button astrid-install-here" onClick={openInBrowser}>
                <span>{installed ? 'Use it here instead' : 'Or use it right here, in the browser'}</span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
