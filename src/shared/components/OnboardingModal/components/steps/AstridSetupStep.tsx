import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Bot, Check, CheckCircle2, Copy, Cpu, ExternalLink, Loader2, Minus, Terminal } from 'lucide-react';
import { MinkRunner } from '@/shared/components/MinkRunner/MinkRunner';
import { DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { inspectAstridCapabilities, type AstridCapabilityCensus } from '@/integrations/astrid/capabilityCensus.ts';
import {
  AGENT_SETUP_BRIEF,
  ASTRID_LAUNCH_COMMANDS,
  ASTRID_STUDIO_MESSAGE,
  detectSetupPlatform,
  MANUAL_SETUP_INTRO,
  MANUAL_SETUP_STEPS,
  PLATFORM_VALIDATED,
  RECONNECT_COMMANDS,
  SETUP_GUIDE_URL,
  SETUP_TROUBLESHOOTING_URL,
  type SetupPlatform,
} from '@/shared/components/OnboardingModal/lib/astridSetupGuide';
import type { OnboardingStepProps } from '@/shared/components/OnboardingModal/types';

const POLL_MS = 4000;
const NO_PROJECT_REASON = /no project exists yet/i;
const REPORT_ISSUE_URL = 'https://github.com/peteromallet/Astrid/issues';

type CheckState = 'checking' | 'pass' | 'fail' | 'later';

export interface SetupChecks {
  runtime: CheckState;
  workspace: CheckState;
  tools: CheckState;
  /** Runtime running and workspace readable: enough to start creating. */
  ready: boolean;
}

/** What the browser can honestly observe of a local install, from the Runtime's own probes. */
export function setupChecksFrom(census: AstridCapabilityCensus | null): SetupChecks {
  if (!census) return { runtime: 'checking', workspace: 'checking', tools: 'checking', ready: false };
  const runtime: CheckState = census.health === 'available' ? 'pass' : 'fail';
  const noProjectYet = !census.projectSlug && NO_PROJECT_REASON.test(census.reasons.projects ?? '');
  const workspace: CheckState = runtime !== 'pass'
    ? 'fail'
    : census.projectSlug || noProjectYet ? 'pass' : 'fail';
  const tools: CheckState = workspace !== 'pass'
    ? 'fail'
    : !census.projectSlug
      ? 'later'
      : census.capabilities.tasks === 'supported' && census.capabilities.generations === 'supported' ? 'pass' : 'fail';
  return { runtime, workspace, tools, ready: runtime === 'pass' && workspace === 'pass' };
}

/*
 * One shared poll of the local Runtime: the setup step and the modal's status line both read it, so
 * neither the person nor their agent has to report back. It stops once setup is ready.
 */
let latestCensus: AstridCapabilityCensus | null = null;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let polling = false;
const listeners = new Set<() => void>();

async function pollRuntime() {
  if (polling) return;
  polling = true;
  try {
    latestCensus = await inspectAstridCapabilities();
  } finally {
    polling = false;
  }
  listeners.forEach((listener) => listener());
  if (listeners.size > 0 && !setupChecksFrom(latestCensus).ready) pollTimer = setTimeout(pollRuntime, POLL_MS);
}

function subscribeToRuntime(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    clearTimeout(pollTimer);
    void pollRuntime();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearTimeout(pollTimer);
  };
}

export function resetSetupChecksForTests() {
  latestCensus = null;
  polling = false;
  clearTimeout(pollTimer);
  listeners.clear();
}

export function useSetupChecks(): SetupChecks {
  const census = useSyncExternalStore(subscribeToRuntime, () => latestCensus, () => null);
  return setupChecksFrom(census);
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [text]);
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="shrink-0 gap-1.5">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="mt-2 flex items-start gap-2">
      <pre className="verbatim-case min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{command}</pre>
      <CopyButton text={command} />
    </div>
  );
}

/**
 * Text to paste into an agent: titled, copyable whole, and collapsed to its opening lines, since the
 * person never needs to read it.
 */
function PastePanel({ title, text, copyLabel }: { title: string; text: string; copyLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-md border bg-muted text-left">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/60 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <CopyButton text={text} label={copyLabel} />
      </div>
      <div className="relative bg-muted">
        <pre className={`verbatim-case whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] ${open ? 'max-h-72 overflow-y-auto' : 'max-h-20 overflow-hidden'}`}>{text}</pre>
        {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-muted to-transparent" />}
      </div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="w-full border-t bg-muted px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {open ? 'Show less' : 'Show all'}
      </button>
    </div>
  );
}

/** After install: open Astrid's own agent and hand it the studio-setup message. */
function MeetAstrid({ platform }: { platform: SetupPlatform }) {
  return (
    <div className="space-y-3 text-left">
      <p className="font-medium">Next, set up your studio with Astrid</p>
      <p className="text-sm text-muted-foreground">
        Open Astrid’s own agent (the first time, it asks which AI model to think with), then paste in this message.
        Astrid sets up how you’ll generate with you: your GPU or APIs, your models and any ComfyUI workflows.
      </p>
      <CommandBlock command={ASTRID_LAUNCH_COMMANDS[platform]} />
      <PastePanel title="Message for Astrid" text={ASTRID_STUDIO_MESSAGE} copyLabel="Copy message" />
    </div>
  );
}

const CHECKS: ReadonlyArray<{ key: keyof Omit<SetupChecks, 'ready'>; label: string; later?: string }> = [
  { key: 'runtime', label: 'Runtime' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'tools', label: 'Tools', later: 'Checked once you have a project' },
];

/** Pending reads as pending (a spinner), not as a failure, until the check passes. */
function CheckMark({ state }: { state: CheckState }) {
  if (state === 'pass') return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-500" aria-hidden />;
  if (state === 'later') return <Minus className="h-3.5 w-3.5" aria-hidden />;
  return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
}

function statusMessage(checks: SetupChecks): string {
  if (checks.ready) return 'Astrid is up and running';
  if (checks.runtime === 'checking') return 'Looking for Astrid';
  if (checks.runtime !== 'pass') return 'Waiting for Astrid to start';
  return 'Almost there';
}

/**
 * What setup is waiting for: a small mark per check, and the running mink while it waits (unless the mink
 * is already shown elsewhere, as above the setup step's title). The modal shows it in its footer, below
 * the scrolling instructions, so it never covers them.
 */
export function SetupStatusLine({ checks, mink = true }: { checks: SetupChecks; mink?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite" aria-label={statusMessage(checks)}>
      {mink && !checks.ready && <MinkRunner className="text-foreground" />}
      <span className="flex items-center gap-4">
        {CHECKS.map(({ key, label, later }) => (
          <span
            key={key}
            className={`inline-flex items-center gap-1.5 ${checks[key] === 'pass' ? 'text-foreground' : ''}`}
            data-check={key}
            data-state={checks[key]}
            title={checks[key] === 'later' ? later : undefined}
          >
            <CheckMark state={checks[key]} />
            {label}
          </span>
        ))}
      </span>
    </div>
  );
}

/** The modal footer's view of setup: the status line until the setup step shows its own result. The
 *  running mink sits above the step's title instead. */
export function SetupFooterStatus() {
  const checks = useSetupChecks();
  return <SetupStatusLine checks={checks} mink={false} />;
}

type SetupRoute = 'agent' | 'manual';

/**
 * First-run setup: the person picks between handing a brief to their agent or doing the steps
 * themselves (in their own platform's shell), while the modal's status line shows the checks ticking off
 * as the Runtime comes up. With `reconnect`, for an install that was set up before but whose Runtime is
 * not running, it just shows how to start it again.
 */
export function AstridSetupStep({ onNext, reconnect = false }: OnboardingStepProps & { reconnect?: boolean }) {
  const [route, setRoute] = useState<SetupRoute>('agent');
  const [platform, setPlatform] = useState<SetupPlatform>(detectSetupPlatform);
  const checks = useSetupChecks();

  useEffect(() => {
    if (reconnect && checks.ready) onNext();
  }, [checks.ready, onNext, reconnect]);

  if (checks.ready && (reconnect || route === 'agent')) {
    return (
      <div className="space-y-6 text-center">
        <DialogHeader className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-500" />
          </div>
          <DialogTitle className="text-center text-2xl font-bold">
            {reconnect ? 'Astrid is running again' : 'Great, you’re set up'}
          </DialogTitle>
        </DialogHeader>
        {reconnect ? <SetupStatusLine checks={checks} /> : <MeetAstrid platform={platform} />}
        <Button variant="retro" size="retro-sm" onClick={onNext} className="w-full sm:w-auto">
          {reconnect ? 'Back to Astrid' : 'Continue'}
        </Button>
      </div>
    );
  }

  if (reconnect) {
    return (
      <div className="space-y-6">
        <DialogHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent">
            <Terminal className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-2xl font-bold">Start Astrid’s Runtime</DialogTitle>
        </DialogHeader>
        <p className="text-center text-muted-foreground">
          Astrid is set up on this computer, but its Runtime isn’t running. Start it from your install folder,
          or ask your agent to. This page continues by itself once it’s up.
        </p>
        <CommandBlock command={RECONNECT_COMMANDS[platform]} />
        <SetupStatusLine checks={checks} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DialogHeader className="space-y-3 text-center">
        {/* The running mink heads the step while setup waits. */}
        {!checks.ready && <MinkRunner className="mx-auto text-foreground" />}
        <DialogTitle className="text-center text-2xl font-bold">Set up Astrid</DialogTitle>
      </DialogHeader>

      <div role="note" className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="space-y-1">
          <p>
            <span className="font-medium">Astrid currently runs locally and generating requires a GPU.</span>
          </p>
          <p className="text-xs text-muted-foreground">
            A hosted version is coming soon, though you can <em>technically</em> use APIs with it right now.
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <SegmentedControl value={route} onValueChange={(value) => setRoute(value as SetupRoute)} variant="pill">
          <SegmentedControlItem value="agent" icon={<Bot className="h-4 w-4" />}>I’ll give this to my agent</SegmentedControlItem>
          <SegmentedControlItem value="manual" icon={<Terminal className="h-4 w-4" />}>I’ll set it up myself</SegmentedControlItem>
        </SegmentedControl>
      </div>

      {route === 'agent' ? (
        <div className="space-y-2">
          <PastePanel title="Brief for your agent to set everything up" text={AGENT_SETUP_BRIEF} copyLabel="Copy brief" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl value={platform} onValueChange={(value) => setPlatform(value as SetupPlatform)} size="sm">
              <SegmentedControlItem value="unix">macOS / Linux</SegmentedControlItem>
              <SegmentedControlItem value="windows">Windows</SegmentedControlItem>
            </SegmentedControl>
            <p className="text-xs text-muted-foreground">
              {PLATFORM_VALIDATED[platform] ? 'Validated on macOS; Linux not yet.' : 'Not yet validated on Windows.'}{' '}
              <a className="underline underline-offset-2" href={REPORT_ISSUE_URL} target="_blank" rel="noreferrer">Tell us what breaks</a>
            </p>
          </div>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">{MANUAL_SETUP_INTRO[platform]}</p>
          <ol className="space-y-4">
            {MANUAL_SETUP_STEPS[platform].map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                  {step.command && <CommandBlock command={step.command} />}
                  {step.message && <div className="mt-2"><PastePanel title="Message for Astrid" text={step.message} copyLabel="Copy message" /></div>}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-4 pl-9 text-sm">
            <a className="inline-flex items-center gap-1 underline underline-offset-2" href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer">
              Full setup guide <ExternalLink className="h-3 w-3" />
            </a>
            <a className="inline-flex items-center gap-1 underline underline-offset-2" href={SETUP_TROUBLESHOOTING_URL} target="_blank" rel="noreferrer">
              Troubleshooting <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {checks.ready && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
              <p className="text-sm">Astrid’s Runtime is up. Finish the last steps (meet Astrid), then continue.</p>
              <Button variant="retro" size="retro-sm" onClick={onNext}>I’ve finished the steps</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
