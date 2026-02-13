import { describe, it, expect, vi } from 'vitest';

// Mock errorHandler to avoid pulling in toast/Supabase dependencies
vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import {
  getDragType,
  setGenerationDragData,
  getGenerationDropData,
  isValidDropTarget,
  isFileDrag,
  NEW_GROUP_DROPPABLE_ID,
} from '../dragDrop';
import type { GenerationDropData } from '../dragDrop';

/**
 * Create a minimal mock of React.DragEvent for testing
 */
function createMockDragEvent(overrides: {
  types?: string[];
  data?: Record<string, string>;
} = {}): React.DragEvent {
  const storedData: Record<string, string> = overrides.data ?? {};
  const types = overrides.types ?? Object.keys(storedData);

  return {
    dataTransfer: {
      types,
      effectAllowed: 'none',
      setData: (type: string, value: string) => {
        storedData[type] = value;
      },
      getData: (type: string) => storedData[type] ?? '',
    },
  } as unknown as React.DragEvent;
}

describe('getDragType', () => {
  it('returns "generation" for generation MIME type', () => {
    const event = createMockDragEvent({ types: ['application/x-generation'] });
    expect(getDragType(event)).toBe('generation');
  });

  it('returns "file" for Files type', () => {
    const event = createMockDragEvent({ types: ['Files'] });
    expect(getDragType(event)).toBe('file');
  });

  it('returns "none" for unknown types', () => {
    const event = createMockDragEvent({ types: ['text/plain'] });
    expect(getDragType(event)).toBe('none');
  });

  it('returns "none" for empty types', () => {
    const event = createMockDragEvent({ types: [] });
    expect(getDragType(event)).toBe('none');
  });

  it('prefers generation over file when both present', () => {
    const event = createMockDragEvent({ types: ['application/x-generation', 'Files'] });
    expect(getDragType(event)).toBe('generation');
  });
});

describe('isFileDrag', () => {
  it('returns true when Files type present', () => {
    const event = createMockDragEvent({ types: ['Files'] });
    expect(isFileDrag(event)).toBe(true);
  });

  it('returns false when no Files type', () => {
    const event = createMockDragEvent({ types: ['text/plain'] });
    expect(isFileDrag(event)).toBe(false);
  });
});

describe('setGenerationDragData / getGenerationDropData round-trip', () => {
  it('round-trips generation data through set and get', () => {
    const data: GenerationDropData = {
      generationId: 'gen-123',
      imageUrl: 'https://example.com/img.png',
      thumbUrl: 'https://example.com/thumb.png',
      metadata: { prompt: 'a cat' },
    };

    const storedData: Record<string, string> = {};
    const setEvent = createMockDragEvent({ data: storedData });
    setGenerationDragData(setEvent, data);

    // Verify data was stored
    expect(storedData['application/x-generation']).toBeTruthy();

    const getEvent = createMockDragEvent({
      types: ['application/x-generation'],
      data: storedData,
    });
    const result = getGenerationDropData(getEvent);

    expect(result).toEqual(data);
  });

  it('returns null when no data in dataTransfer', () => {
    const event = createMockDragEvent({ data: {} });
    expect(getGenerationDropData(event)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const event = createMockDragEvent({
      data: { 'application/x-generation': 'not-json' },
    });
    expect(getGenerationDropData(event)).toBeNull();
  });

  it('returns null when required fields missing', () => {
    const event = createMockDragEvent({
      data: { 'application/x-generation': JSON.stringify({ generationId: 'gen-1' }) }, // missing imageUrl
    });
    expect(getGenerationDropData(event)).toBeNull();
  });

  it('falls back to text/plain data', () => {
    const data: GenerationDropData = {
      generationId: 'gen-456',
      imageUrl: 'https://example.com/img.png',
    };

    const event = createMockDragEvent({
      data: { 'text/plain': JSON.stringify(data) },
    });
    const result = getGenerationDropData(event);
    expect(result).toEqual(data);
  });
});

describe('isValidDropTarget', () => {
  it('returns true for generation drag', () => {
    const event = createMockDragEvent({ types: ['application/x-generation'] });
    expect(isValidDropTarget(event)).toBe(true);
  });

  it('returns true for file drag', () => {
    const event = createMockDragEvent({ types: ['Files'] });
    expect(isValidDropTarget(event)).toBe(true);
  });

  it('returns false for other drag types', () => {
    const event = createMockDragEvent({ types: ['text/plain'] });
    expect(isValidDropTarget(event)).toBe(false);
  });
});

describe('constants', () => {
  it('exports NEW_GROUP_DROPPABLE_ID', () => {
    expect(NEW_GROUP_DROPPABLE_ID).toBe('new-shot-group-dropzone');
  });
});
