import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePromptFieldState } from '../usePromptFieldState';

describe('usePromptFieldState', () => {
  const mockOnSettingsChange = vi.fn();
  const mockOnClearEnhancedPrompt = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    settingsPrompt: undefined as string | undefined,
    enhancedPrompt: undefined as string | undefined,
    basePromptForEnhancement: undefined as string | undefined,
    defaultPrompt: undefined as string | undefined,
    onSettingsChange: mockOnSettingsChange,
    onClearEnhancedPrompt: mockOnClearEnhancedPrompt,
  };

  it('returns empty string when nothing is set', () => {
    const { result } = renderHook(() => usePromptFieldState(defaultProps));

    expect(result.current.displayValue).toBe('');
    expect(result.current.badgeType).toBeNull();
    expect(result.current.hasEnhancedPrompt).toBe(false);
    expect(result.current.userHasSetPrompt).toBe(false);
    expect(result.current.userHasEditedAfterEnhancement).toBe(false);
  });

  it('falls back to default prompt when no settings or enhanced prompt', () => {
    const { result } = renderHook(() =>
      usePromptFieldState({
        ...defaultProps,
        defaultPrompt: 'shot default prompt',
      })
    );

    expect(result.current.displayValue).toBe('shot default prompt');
    expect(result.current.badgeType).toBe('default');
  });

  it('shows settings prompt over default prompt', () => {
    const { result } = renderHook(() =>
      usePromptFieldState({
        ...defaultProps,
        settingsPrompt: 'user prompt',
        defaultPrompt: 'shot default',
      })
    );

    expect(result.current.displayValue).toBe('user prompt');
    expect(result.current.badgeType).toBeNull();
    expect(result.current.userHasSetPrompt).toBe(true);
  });

  it('shows enhanced prompt over settings when base matches', () => {
    const { result } = renderHook(() =>
      usePromptFieldState({
        ...defaultProps,
        settingsPrompt: 'base prompt',
        enhancedPrompt: 'AI enhanced version',
        basePromptForEnhancement: 'base prompt',
      })
    );

    expect(result.current.displayValue).toBe('AI enhanced version');
    expect(result.current.badgeType).toBe('enhanced');
    expect(result.current.hasEnhancedPrompt).toBe(true);
    expect(result.current.userHasEditedAfterEnhancement).toBe(false);
  });

  it('shows user edit over enhanced when base differs', () => {
    const { result } = renderHook(() =>
      usePromptFieldState({
        ...defaultProps,
        settingsPrompt: 'user edited after enhancement',
        enhancedPrompt: 'AI enhanced version',
        basePromptForEnhancement: 'original base prompt',
      })
    );

    expect(result.current.displayValue).toBe('user edited after enhancement');
    expect(result.current.badgeType).toBeNull();
    expect(result.current.userHasEditedAfterEnhancement).toBe(true);
  });

  it('falls back to comparing against enhanced prompt when no base stored', () => {
    const { result } = renderHook(() =>
      usePromptFieldState({
        ...defaultProps,
        settingsPrompt: 'different from enhanced',
        enhancedPrompt: 'AI enhanced version',
        basePromptForEnhancement: undefined,
      })
    );

    expect(result.current.displayValue).toBe('different from enhanced');
    expect(result.current.userHasEditedAfterEnhancement).toBe(true);
  });

  it('handleChange calls onSettingsChange', () => {
    const { result } = renderHook(() => usePromptFieldState(defaultProps));

    act(() => {
      result.current.handleChange('new prompt');
    });

    expect(mockOnSettingsChange).toHaveBeenCalledWith('new prompt');
  });

  it('handleClearAll clears both settings and enhanced', () => {
    const { result } = renderHook(() =>
      usePromptFieldState({
        ...defaultProps,
        settingsPrompt: 'user prompt',
        enhancedPrompt: 'enhanced',
      })
    );

    act(() => {
      result.current.handleClearAll();
    });

    expect(mockOnSettingsChange).toHaveBeenCalledWith(undefined);
    expect(mockOnClearEnhancedPrompt).toHaveBeenCalled();
  });

  it('handleClearEnhanced only clears enhanced prompt', () => {
    const { result } = renderHook(() =>
      usePromptFieldState({
        ...defaultProps,
        enhancedPrompt: 'enhanced',
      })
    );

    act(() => {
      result.current.handleClearEnhanced();
    });

    expect(mockOnClearEnhancedPrompt).toHaveBeenCalled();
    expect(mockOnSettingsChange).not.toHaveBeenCalled();
  });

  it('handleVoiceResult passes prompt to onSettingsChange', () => {
    const { result } = renderHook(() => usePromptFieldState(defaultProps));

    act(() => {
      result.current.handleVoiceResult({ prompt: 'voice prompt', transcription: 'raw transcription' });
    });

    expect(mockOnSettingsChange).toHaveBeenCalledWith('voice prompt');
  });

  it('handleVoiceResult falls back to transcription when no prompt', () => {
    const { result } = renderHook(() => usePromptFieldState(defaultProps));

    act(() => {
      result.current.handleVoiceResult({ transcription: 'raw transcription' });
    });

    expect(mockOnSettingsChange).toHaveBeenCalledWith('raw transcription');
  });
});
