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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetSelectionStoreForTests();
  });

  it('shows the authored exchange and result when not driven by activation', () => {
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

  it('opens already thinking, then replies the first time the conversation becomes active', async () => {
    vi.useFakeTimers();
    const renderActive = (active: boolean) => (
      <PublicAstridExampleProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}>
        <PublicAstridScriptedConversation onOpenVerifiedResult={vi.fn()} active={active} />
      </PublicAstridExampleProvider>
    );
    const { rerender } = render(renderActive(false));
    // Staged while the chat is closed, so opening it reveals the request and "Thinking..." at once.
    expect(screen.getByText(LIGHT_STUDY_SCRIPT.request)).toBeInTheDocument();
    expect(screen.getByText('Thinking...')).toBeInTheDocument();

    rerender(renderActive(true));
    expect(screen.getByText(LIGHT_STUDY_SCRIPT.request)).toBeInTheDocument();
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    expect(screen.queryByText(LIGHT_STUDY_SCRIPT.response)).not.toBeInTheDocument();
    expect(screen.queryByText('Example result unavailable until a verified render.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message Astrid' })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    expect(screen.getByText(LIGHT_STUDY_SCRIPT.response)).toBeInTheDocument();
    expect(screen.getByText('Example result unavailable until a verified render.')).toBeInTheDocument();

    rerender(renderActive(false));
    rerender(renderActive(true));
    expect(screen.getByText(LIGHT_STUDY_SCRIPT.response)).toBeInTheDocument();
    expect(screen.getByText('Example result unavailable until a verified render.')).toBeInTheDocument();
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
  });

  it('starts the exchange over if the conversation is left before the reply', async () => {
    vi.useFakeTimers();
    const renderActive = (active: boolean) => (
      <PublicAstridExampleProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}>
        <PublicAstridScriptedConversation onOpenVerifiedResult={vi.fn()} active={active} />
      </PublicAstridExampleProvider>
    );
    const { rerender } = render(renderActive(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    rerender(renderActive(false));
    rerender(renderActive(true));
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(screen.queryByText(LIGHT_STUDY_SCRIPT.response)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });
    expect(screen.getByText(LIGHT_STUDY_SCRIPT.response)).toBeInTheDocument();
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
