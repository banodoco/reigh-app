// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIGHT_STUDY_SCRIPT } from './content/light-study-v1/authored-script.ts';
import { LIGHT_STUDY_PUBLIC_EXAMPLE } from './content/light-study-v1/public-example.ts';
import { PublicAstridExampleProvider } from './publicAstridExample.tsx';
import { PublicAstridScriptedConversation } from './PublicAstridScriptedConversation.tsx';
import { createVerifiedPublicAstridExampleForTest, TEST_OUTPUT_CLIP_ID } from './__tests__/fixtures/verifiedPublicAstridExample.ts';
import { __getSelectionStateForTests, __resetSelectionStoreForTests } from '@/shared/state/selectionStore.ts';

describe('PublicAstridScriptedConversation', () => {
  it('reports mounted readiness before the host reveals and activates the conversation', () => {
    const onReady = vi.fn();
    render(<PublicAstridExampleProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}><PublicAstridScriptedConversation onReady={onReady} active={false} onOpenVerifiedResult={vi.fn()} /></PublicAstridExampleProvider>);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Message Astrid' })).toBeInTheDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetSelectionStoreForTests();
  });

  it('shows the authored exchange and result by default', () => {
    render(<PublicAstridExampleProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}><PublicAstridScriptedConversation onOpenVerifiedResult={vi.fn()} /></PublicAstridExampleProvider>);

    expect(screen.getByText('Astrid')).toBeInTheDocument();
    expect(screen.queryByText(LIGHT_STUDY_SCRIPT.label)).not.toBeInTheDocument();
    expect(screen.getByText(LIGHT_STUDY_SCRIPT.request)).toBeInTheDocument();
    expect(screen.getByText(LIGHT_STUDY_SCRIPT.response)).toBeInTheDocument();
    expect(screen.getByText('Example result unavailable until a verified render.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open in Workspace Preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Replay/ })).not.toBeInTheDocument();
  });

  it('offers a composer that explains the example instead of posting a message', async () => {
    vi.useFakeTimers();
    render(<PublicAstridExampleProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}><PublicAstridScriptedConversation onOpenVerifiedResult={vi.fn()} /></PublicAstridExampleProvider>);
    const input = screen.getByRole('textbox', { name: 'Message Astrid' });
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Make it warmer' } });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    expect(input).toHaveValue('');
    expect(screen.queryByText('Make it warmer')).not.toBeInTheDocument();
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('This conversation is a scripted example. Install the agent to try your own.');
    expect(note).toHaveAttribute('data-visible', 'true');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
    });
    expect(note).toHaveAttribute('data-visible', 'false');
  });

  it('shows the completed exchange before entry and keeps it complete across Agent visits', () => {
    const renderActive = (active: boolean) => (
      <PublicAstridExampleProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}>
        <PublicAstridScriptedConversation onOpenVerifiedResult={vi.fn()} active={active} />
      </PublicAstridExampleProvider>
    );
    const { rerender } = render(renderActive(false));
    const expectCompletedExchange = () => {
      expect(screen.getByText(LIGHT_STUDY_SCRIPT.request)).toBeInTheDocument();
      expect(screen.getByText(LIGHT_STUDY_SCRIPT.response)).toBeInTheDocument();
      expect(screen.getByText('Example result unavailable until a verified render.')).toBeInTheDocument();
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Message Astrid' })).toBeInTheDocument();
    };
    expectCompletedExchange();
    rerender(renderActive(true));
    expectCompletedExchange();
    rerender(renderActive(false));
    rerender(renderActive(true));
    expectCompletedExchange();
  });

  it('preserves the reader’s scroll position when entering Agent and resizing the card', () => {
    const renderActive = (active: boolean) => (
      <PublicAstridExampleProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}>
        <PublicAstridScriptedConversation onOpenVerifiedResult={vi.fn()} active={active} />
      </PublicAstridExampleProvider>
    );
    const { rerender, container } = render(renderActive(false));
    const thread = container.querySelector<HTMLDivElement>('[data-conversation-presentation] > div:nth-child(2)')!;
    Object.defineProperty(thread, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(thread, 'clientHeight', { configurable: true, value: 250 });
    thread.scrollTop = 80;
    fireEvent.scroll(thread);

    rerender(renderActive(true));
    expect(thread.scrollTop).toBe(80);
    Object.defineProperty(thread, 'clientHeight', { configurable: true, value: 400 });
    fireEvent(window, new Event('resize'));
    rerender(renderActive(true));
    expect(thread.scrollTop).toBe(80);
  });

  it('offers an in-chat handoff only for a verified result mapped to an exact existing clip', () => {
    const onOpenVerifiedResult = vi.fn();
    render(
      <PublicAstridExampleProvider example={createVerifiedPublicAstridExampleForTest()}>
        <PublicAstridScriptedConversation onOpenVerifiedResult={onOpenVerifiedResult} />
      </PublicAstridExampleProvider>,
    );

    expect(screen.getByText('Verified Test output result available.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open in Workspace Preview' }));
    expect(onOpenVerifiedResult).toHaveBeenCalledTimes(1);
    expect(onOpenVerifiedResult).toHaveBeenCalledWith();
    expect(__getSelectionStateForTests().timeline.selectedClipId).toBe(TEST_OUTPUT_CLIP_ID);
  });
});
