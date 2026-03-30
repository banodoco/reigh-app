/**
 * Handles persistence of stroke data across media switches.
 * Uses in-memory cache + localStorage for stroke restoration.
 */

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type { BrushStroke, StrokeCache } from './types';

interface UseStrokePersistenceProps {
  media: GenerationRow;
  activeVariantId?: string | null;
  isInpaintMode: boolean;
}

interface UseStrokePersistenceReturn {
  inpaintStrokes: BrushStroke[];
  annotationStrokes: BrushStroke[];
  brushSize: number;
  setInpaintStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>;
  setAnnotationStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>;
  setBrushSize: (size: number) => void;
}

export function useStrokePersistence({
  media,
  activeVariantId,
  isInpaintMode,
}: UseStrokePersistenceProps): UseStrokePersistenceReturn {
  // Storage key uses variant ID if available, otherwise falls back to generation ID
  const storageKey = activeVariantId
    ? `inpaint-data-${media.id}-variant-${activeVariantId}`
    : `inpaint-data-${media.id}`;

  const [inpaintStrokes, setInpaintStrokes] = useState<BrushStroke[]>([]);
  const [annotationStrokes, setAnnotationStrokes] = useState<BrushStroke[]>([]);
  const [brushSize, setBrushSize] = useState(20);

  const prevStorageKeyRef = useRef<string>(storageKey);
  const prevMediaIdRef = useRef(media.id);
  const transitionRafRef = useRef<number | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inpaintStrokesRef = useRef(inpaintStrokes);
  inpaintStrokesRef.current = inpaintStrokes;
  const annotationStrokesRef = useRef(annotationStrokes);
  annotationStrokesRef.current = annotationStrokes;
  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;

  const mediaStrokeCacheRef = useRef<Map<string, StrokeCache>>(new Map());
  const hydratedMediaIdsRef = useRef<Set<string>>(new Set());

  const saveToLocalStorage = useCallback(() => {
    if (!isInpaintMode) return;

    try {
      const data = {
        inpaintStrokes,
        annotationStrokes,
        brushSize,
        savedAt: Date.now()
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch { /* intentionally ignored */ }
  }, [inpaintStrokes, annotationStrokes, brushSize, isInpaintMode, storageKey]);

  useLayoutEffect(() => {
    if (prevMediaIdRef.current === media.id) {
      return;
    }

    const oldMediaId = prevMediaIdRef.current;
    const newMediaId = media.id;

    if (transitionRafRef.current !== null) {
      cancelAnimationFrame(transitionRafRef.current);
      transitionRafRef.current = null;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (oldMediaId) {
      mediaStrokeCacheRef.current.set(oldMediaId, {
        inpaintStrokes: inpaintStrokesRef.current,
        annotationStrokes: annotationStrokesRef.current,
        brushSize: brushSizeRef.current,
      });
    }

    setInpaintStrokes([]);
    setAnnotationStrokes([]);
    setBrushSize(20);

    const cached = mediaStrokeCacheRef.current.get(newMediaId);
    if (cached) {
      setInpaintStrokes(cached.inpaintStrokes);
      setAnnotationStrokes(cached.annotationStrokes);
      setBrushSize(cached.brushSize);
    } else if (isInpaintMode && !hydratedMediaIdsRef.current.has(storageKey)) {
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          const loadedInpaintStrokes = parsed.inpaintStrokes || parsed.strokes || [];
          const loadedAnnotationStrokes = parsed.annotationStrokes || [];

          setInpaintStrokes(loadedInpaintStrokes);
          setAnnotationStrokes(loadedAnnotationStrokes);
          setBrushSize(parsed.brushSize || 20);
          hydratedMediaIdsRef.current.add(storageKey);
        }
      } catch { /* intentionally ignored */ }
    }

    prevMediaIdRef.current = newMediaId;

    transitionRafRef.current = requestAnimationFrame(() => {
      transitionRafRef.current = null;
    });
  }, [media.id, isInpaintMode, storageKey]);

  useEffect(() => {
    if (prevStorageKeyRef.current !== storageKey) {
      if (isInpaintMode && (inpaintStrokes.length > 0 || annotationStrokes.length > 0)) {
        try {
          const data = {
            inpaintStrokes,
            annotationStrokes,
            brushSize,
            savedAt: Date.now()
          };
          localStorage.setItem(prevStorageKeyRef.current, JSON.stringify(data));
        } catch { /* intentionally ignored */ }
      }

      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          const loadedInpaintStrokes = parsed.inpaintStrokes || parsed.strokes || [];
          const loadedAnnotationStrokes = parsed.annotationStrokes || [];

          setInpaintStrokes(loadedInpaintStrokes);
          setAnnotationStrokes(loadedAnnotationStrokes);
          setBrushSize(parsed.brushSize || 20);
        } else {
          setInpaintStrokes([]);
          setAnnotationStrokes([]);
          setBrushSize(20);
        }
      } catch {
        setInpaintStrokes([]);
        setAnnotationStrokes([]);
        setBrushSize(20);
      }

      prevStorageKeyRef.current = storageKey;
    }
  }, [storageKey, isInpaintMode, inpaintStrokes, annotationStrokes, brushSize]);

  useEffect(() => {
    if (!isInpaintMode) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveToLocalStorage();
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [inpaintStrokes, annotationStrokes, brushSize, isInpaintMode, saveToLocalStorage]);

  useEffect(() => {
    return () => {
      if (isInpaintMode) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveToLocalStorage();
      }
    };
  }, [isInpaintMode, saveToLocalStorage]);

  return {
    inpaintStrokes,
    annotationStrokes,
    brushSize,
    setInpaintStrokes,
    setAnnotationStrokes,
    setBrushSize,
  };
}
