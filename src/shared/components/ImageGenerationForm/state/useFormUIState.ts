/**
 * useFormUIState - Reducer for ImageGenerationForm UI state
 *
 * Manages modal states, active prompts, and session tracking.
 * Form settings (persisted values) remain as useState with usePersistentToolState.
 */

import { useReducer, useCallback, useMemo } from 'react';
import {
  ImageGenerationFormUIState,
  ImageGenerationFormUIAction,
  createInitialUIState,
} from './types';

export type { ImageGenerationFormUIState } from './types';

// ============================================================================
// Reducer
// ============================================================================

const formUIReducer = (
  state: ImageGenerationFormUIState,
  action: ImageGenerationFormUIAction
): ImageGenerationFormUIState => {
  switch (action.type) {
    case 'SET_PROMPT_MODAL_OPEN':
      if (action.payload === state.isPromptModalOpen) return state;
      return { ...state, isPromptModalOpen: action.payload };

    case 'SET_PROMPT_MODAL_WITH_AI_EXPANDED':
      if (action.payload === state.openPromptModalWithAIExpanded) return state;
      return { ...state, openPromptModalWithAIExpanded: action.payload };

    case 'SET_CREATE_SHOT_MODAL_OPEN':
      if (action.payload === state.isCreateShotModalOpen) return state;
      return { ...state, isCreateShotModalOpen: action.payload };

    case 'SET_ACTIVE_PROMPT_ID':
      if (action.payload === state.directFormActivePromptId) return state;
      return { ...state, directFormActivePromptId: action.payload };

    case 'SET_HAS_VISITED':
      if (action.payload === state.hasVisitedImageGeneration) return state;
      return { ...state, hasVisitedImageGeneration: action.payload };

    case 'OPEN_PROMPT_MODAL':
      return {
        ...state,
        isPromptModalOpen: true,
        openPromptModalWithAIExpanded: action.payload.withAI ?? false,
      };

    case 'CLOSE_PROMPT_MODAL':
      if (!state.isPromptModalOpen) return state;
      return {
        ...state,
        isPromptModalOpen: false,
        openPromptModalWithAIExpanded: false,
      };

    default:
      return state;
  }
};

// ============================================================================
// Action Creators Interface
// ============================================================================

export interface FormUIActions {
  setPromptModalOpen: (open: boolean) => void;
  setPromptModalWithAIExpanded: (expanded: boolean) => void;
  setCreateShotModalOpen: (open: boolean) => void;
  setActivePromptId: (id: string | null) => void;
  setHasVisited: (visited: boolean) => void;
  openPromptModal: (withAI?: boolean) => void;
  closePromptModal: () => void;
  openMagicPrompt: () => void;
}

// ============================================================================
// Hook
// ============================================================================

interface UseFormUIStateReturn {
  uiState: ImageGenerationFormUIState;
  uiActions: FormUIActions;
}

export const useFormUIState = (): UseFormUIStateReturn => {
  const [uiState, dispatch] = useReducer(formUIReducer, undefined, createInitialUIState);

  // Action creators - all memoized with useCallback
  const setPromptModalOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_PROMPT_MODAL_OPEN', payload: open });
  }, []);

  const setPromptModalWithAIExpanded = useCallback((expanded: boolean) => {
    dispatch({ type: 'SET_PROMPT_MODAL_WITH_AI_EXPANDED', payload: expanded });
  }, []);

  const setCreateShotModalOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_CREATE_SHOT_MODAL_OPEN', payload: open });
  }, []);

  const setActivePromptId = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_PROMPT_ID', payload: id });
  }, []);

  const setHasVisited = useCallback((visited: boolean) => {
    dispatch({ type: 'SET_HAS_VISITED', payload: visited });
  }, []);

  const openPromptModal = useCallback((withAI?: boolean) => {
    dispatch({ type: 'OPEN_PROMPT_MODAL', payload: { withAI } });
  }, []);

  const closePromptModal = useCallback(() => {
    dispatch({ type: 'CLOSE_PROMPT_MODAL' });
  }, []);

  const openMagicPrompt = useCallback(() => {
    dispatch({ type: 'OPEN_PROMPT_MODAL', payload: { withAI: true } });
  }, []);

  // Memoize the actions object
  const uiActions = useMemo<FormUIActions>(() => ({
    setPromptModalOpen,
    setPromptModalWithAIExpanded,
    setCreateShotModalOpen,
    setActivePromptId,
    setHasVisited,
    openPromptModal,
    closePromptModal,
    openMagicPrompt,
  }), [
    setPromptModalOpen,
    setPromptModalWithAIExpanded,
    setCreateShotModalOpen,
    setActivePromptId,
    setHasVisited,
    openPromptModal,
    closePromptModal,
    openMagicPrompt,
  ]);

  return { uiState, uiActions };
};
