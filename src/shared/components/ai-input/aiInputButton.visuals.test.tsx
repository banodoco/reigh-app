import React from 'react';
import { describe, expect, it } from 'vitest';
import { Check, Loader2, Mic, Square, Wand2 } from 'lucide-react';
import { getButtonStyles, getMainIcon, getTooltipText } from './aiInputButton.visuals';

describe('aiInputButton visuals', () => {
  it('returns the correct icons for voice and text states', () => {
    expect((getMainIcon({
      mode: 'voice',
      voiceState: 'recording',
      textState: 'idle',
      hasExistingContent: false,
    }) as React.ReactElement).type).toBe(Square);

    expect((getMainIcon({
      mode: 'voice',
      voiceState: 'processing',
      textState: 'idle',
      hasExistingContent: false,
    }) as React.ReactElement).type).toBe(Loader2);

    expect((getMainIcon({
      mode: 'voice',
      voiceState: 'idle',
      textState: 'idle',
      hasExistingContent: false,
    }) as React.ReactElement).type).toBe(Mic);

    expect((getMainIcon({
      mode: 'text',
      voiceState: 'idle',
      textState: 'success',
      hasExistingContent: true,
    }) as React.ReactElement).type).toBe(Check);

    expect((getMainIcon({
      mode: 'text',
      voiceState: 'idle',
      textState: 'idle',
      hasExistingContent: false,
    }) as React.ReactElement).type).toBe(Wand2);
  });

  it('returns descriptive tooltip text and button styles', () => {
    expect(getTooltipText({
      mode: 'voice',
      voiceState: 'recording',
      textState: 'idle',
      hasExistingContent: true,
    })).toBe('Stop recording');

    expect(getTooltipText({
      mode: 'voice',
      voiceState: 'idle',
      textState: 'idle',
      hasExistingContent: true,
    })).toBe('Voice input to create/edit prompt');

    expect(getTooltipText({
      mode: 'text',
      voiceState: 'idle',
      textState: 'idle',
      hasExistingContent: false,
    })).toBe('Type instructions to create prompt');

    expect(getButtonStyles({
      mode: 'voice',
      voiceState: 'recording',
      textState: 'idle',
      hasExistingContent: false,
    })).toContain('bg-red-500');

    expect(getButtonStyles({
      mode: 'text',
      voiceState: 'idle',
      textState: 'processing',
      hasExistingContent: true,
    })).toContain('bg-purple-500');

    expect(getButtonStyles({
      mode: 'text',
      voiceState: 'idle',
      textState: 'success',
      hasExistingContent: true,
    })).toContain('bg-green-500');
  });
});
