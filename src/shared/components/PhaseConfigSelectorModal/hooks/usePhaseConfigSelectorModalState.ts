import { useCallback, useEffect, useReducer } from 'react';
import type { Resource, PhaseConfigMetadata } from '@/features/resources/hooks/useResources';

type PresetResource = Resource & { metadata: PhaseConfigMetadata };

type ActiveTab = 'browse' | 'add-new';

interface PhaseConfigSelectorModalState {
  activeTab: ActiveTab;
  editingPreset: PresetResource | null;
  isOverwriting: boolean;
  showMyPresetsOnly: boolean;
  showSelectedPresetOnly: boolean;
  processedPresetsLength: number;
  currentPage: number;
  totalPages: number;
  onPageChange: ((page: number) => void) | null;
}

type PhaseConfigSelectorModalAction =
  | { type: 'setActiveTab'; tab: ActiveTab }
  | { type: 'startEditing'; preset: PresetResource; overwrite: boolean }
  | { type: 'clearEditing' }
  | { type: 'setShowMyPresetsOnly'; value: boolean }
  | { type: 'toggleShowMyPresetsOnly' }
  | { type: 'toggleShowSelectedPresetOnly' }
  | { type: 'setProcessedPresetsLength'; value: number }
  | { type: 'setPagination'; page: number; total: number; setPage: (page: number) => void };

function createInitialState(initialTab: ActiveTab): PhaseConfigSelectorModalState {
  return {
    activeTab: initialTab,
    editingPreset: null,
    isOverwriting: false,
    showMyPresetsOnly: false,
    showSelectedPresetOnly: false,
    processedPresetsLength: 0,
    currentPage: 0,
    totalPages: 0,
    onPageChange: null,
  };
}

function reducer(
  state: PhaseConfigSelectorModalState,
  action: PhaseConfigSelectorModalAction,
): PhaseConfigSelectorModalState {
  switch (action.type) {
    case 'setActiveTab':
      return {
        ...state,
        activeTab: action.tab,
      };

    case 'startEditing':
      return {
        ...state,
        activeTab: 'add-new',
        editingPreset: action.preset,
        isOverwriting: action.overwrite,
      };

    case 'clearEditing':
      return {
        ...state,
        editingPreset: null,
        isOverwriting: false,
      };

    case 'setShowMyPresetsOnly':
      return {
        ...state,
        showMyPresetsOnly: action.value,
      };

    case 'toggleShowMyPresetsOnly':
      return {
        ...state,
        showMyPresetsOnly: !state.showMyPresetsOnly,
      };

    case 'toggleShowSelectedPresetOnly':
      return {
        ...state,
        showSelectedPresetOnly: !state.showSelectedPresetOnly,
      };

    case 'setProcessedPresetsLength':
      return {
        ...state,
        processedPresetsLength: action.value,
      };

    case 'setPagination':
      return {
        ...state,
        currentPage: action.page,
        totalPages: action.total,
        onPageChange: action.setPage,
      };

    default:
      return state;
  }
}

interface UsePhaseConfigSelectorModalStateParams {
  isOpen: boolean;
  initialTab: ActiveTab;
  intent: 'load' | 'overwrite';
}

export function usePhaseConfigSelectorModalState({
  isOpen,
  initialTab,
  intent,
}: UsePhaseConfigSelectorModalStateParams) {
  const [state, dispatch] = useReducer(reducer, initialTab, createInitialState);

  useEffect(() => {
    if (isOpen) {
      dispatch({ type: 'setActiveTab', tab: initialTab });
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    dispatch({
      type: 'setShowMyPresetsOnly',
      value: intent === 'overwrite',
    });
  }, [intent, isOpen]);

  const setActiveTab = useCallback((tab: string) => {
    dispatch({
      type: 'setActiveTab',
      tab: tab === 'add-new' ? 'add-new' : 'browse',
    });
  }, []);

  const handleEdit = useCallback((preset: PresetResource) => {
    dispatch({ type: 'startEditing', preset, overwrite: false });
  }, []);

  const handleOverwrite = useCallback((preset: PresetResource) => {
    dispatch({ type: 'startEditing', preset, overwrite: true });
  }, []);

  const handleClearEdit = useCallback(() => {
    dispatch({ type: 'clearEditing' });
  }, []);

  const handleSwitchToBrowse = useCallback(() => {
    dispatch({ type: 'setActiveTab', tab: 'browse' });
    dispatch({ type: 'clearEditing' });
  }, []);

  const toggleShowMyPresetsOnly = useCallback(() => {
    dispatch({ type: 'toggleShowMyPresetsOnly' });
  }, []);

  const toggleShowSelectedPresetOnly = useCallback(() => {
    dispatch({ type: 'toggleShowSelectedPresetOnly' });
  }, []);

  const setProcessedPresetsLength = useCallback((value: number) => {
    dispatch({ type: 'setProcessedPresetsLength', value });
  }, []);

  const handlePageChange = useCallback(
    (page: number, total: number, setPage: (page: number) => void) => {
      dispatch({ type: 'setPagination', page, total, setPage });
    },
    [],
  );

  return {
    state,
    setActiveTab,
    handleEdit,
    handleOverwrite,
    handleClearEdit,
    handleSwitchToBrowse,
    toggleShowMyPresetsOnly,
    toggleShowSelectedPresetOnly,
    setProcessedPresetsLength,
    handlePageChange,
  };
}
