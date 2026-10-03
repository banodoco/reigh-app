import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstridCapabilityCensus } from '@/integrations/astrid/capabilityCensus.ts';

const { inspectMock } = vi.hoisted(() => ({ inspectMock: vi.fn() }));
vi.mock('@/integrations/astrid/capabilityCensus.ts', () => ({ inspectAstridCapabilities: inspectMock }));

import type { ReactElement } from 'react';
import { Dialog, DialogContent } from '@/shared/components/ui/dialog';
import { AstridSetupStep, resetSetupChecksForTests, setupChecksFrom } from './AstridSetupStep';

const renderInDialog = (ui: ReactElement) => render(<Dialog open><DialogContent>{ui}</DialogContent></Dialog>);
import { AGENT_SETUP_BRIEF, ASTRID_LAUNCH_COMMANDS, ASTRID_STUDIO_MESSAGE, MANUAL_SETUP_STEPS, RECONNECT_COMMANDS } from '@/shared/components/OnboardingModal/lib/astridSetupGuide';

const down: AstridCapabilityCensus = {
  health: 'unavailable', readiness: 'unavailable', projectSlug: null,
  capabilities: { tasks: 'unknown', generations: 'unknown', media: 'unknown' },
  reasons: { health: 'bridge health unavailable' },
};
const freshWorkspace: AstridCapabilityCensus = {
  health: 'available', readiness: 'degraded', projectSlug: null,
  capabilities: { tasks: 'unknown', generations: 'unknown', media: 'unknown' },
  reasons: { projects: 'No project exists yet; project-scoped capabilities were not probed.' },
};
const ready: AstridCapabilityCensus = {
  health: 'available', readiness: 'ready', projectSlug: 'demo',
  capabilities: { tasks: 'supported', generations: 'supported', media: 'supported' },
  reasons: {},
};

describe('setupChecksFrom', () => {
  it('is not ready while the Runtime is down', () => {
    expect(setupChecksFrom(down)).toMatchObject({ runtime: 'fail', workspace: 'fail', ready: false });
  });

  it('counts a brand-new workspace with no projects as set up, checking tools later', () => {
    expect(setupChecksFrom(freshWorkspace)).toMatchObject({ runtime: 'pass', workspace: 'pass', tools: 'later', ready: true });
  });

  it('does not count an unreadable workspace as set up', () => {
    const broken = { ...freshWorkspace, reasons: { projects: 'Astrid bridge request failed: 500' } };
    expect(setupChecksFrom(broken)).toMatchObject({ runtime: 'pass', workspace: 'fail', ready: false });
  });

  it('passes every check on a working install with a project', () => {
    expect(setupChecksFrom(ready)).toMatchObject({ runtime: 'pass', workspace: 'pass', tools: 'pass', ready: true });
  });
});

describe('AstridSetupStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSetupChecksForTests();
  });

  it('offers the agent brief verbatim and copies it whole', async () => {
    inspectMock.mockResolvedValue(down);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderInDialog(<AstridSetupStep onNext={vi.fn()} onClose={vi.fn()} />);
    await act(async () => {});

    expect(screen.getByRole('note').textContent).toMatch(/requires a GPU/i);
    expect(screen.getByRole('note').textContent).toMatch(/technically use APIs/i);
    fireEvent.click(screen.getByRole('button', { name: /copy brief/i }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith(AGENT_SETUP_BRIEF);
  });

  it('lists the manual steps when the person sets it up themselves', async () => {
    inspectMock.mockResolvedValue(down);
    renderInDialog(<AstridSetupStep onNext={vi.fn()} onClose={vi.fn()} />);
    await act(async () => {});

    fireEvent.click(screen.getByText(/set it up myself/i));
    for (const step of MANUAL_SETUP_STEPS.unix) expect(screen.getByText(step.title)).toBeTruthy();
    expect(screen.getByText(/check what you already have/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Windows'));
    expect(screen.getByText(/open powershell/i)).toBeTruthy();
    expect(screen.getByText(/not yet validated on windows/i)).toBeTruthy();
  });

  it('says you are set up once the Runtime responds, and continues', async () => {
    inspectMock.mockResolvedValue(freshWorkspace);
    const onNext = vi.fn();
    renderInDialog(<AstridSetupStep onNext={onNext} onClose={vi.fn()} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it('once set up, hands over to Astrid with a message to paste in', async () => {
    inspectMock.mockResolvedValue(freshWorkspace);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderInDialog(<AstridSetupStep onNext={vi.fn()} onClose={vi.fn()} />);
    await act(async () => {});

    expect(screen.getByText(/set up your studio with astrid/i)).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'PRE' && element.textContent === ASTRID_LAUNCH_COMMANDS.unix)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /copy message/i }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith(ASTRID_STUDIO_MESSAGE);
  });

  it('shows a set-up install how to start its Runtime again', async () => {
    inspectMock.mockResolvedValue(down);
    renderInDialog(<AstridSetupStep reconnect onNext={vi.fn()} onClose={vi.fn()} />);
    await act(async () => {});

    expect(screen.getByText(RECONNECT_COMMANDS.unix)).toBeTruthy();
  });
});
