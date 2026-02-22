import { useReducer, useCallback, useMemo } from 'react';
import { ShotEditorState, ShotEditorAction } from './types';

// Initial state
const createInitialState = (): ShotEditorState => ({
  isUploadingImage: false,
  uploadProgress: 0,
  fileInputKey: Date.now(),
  deletingVideoId: null,
  duplicatingImageId: null,
  duplicateSuccessImageId: null,
  pendingFramePositions: new Map(),
  // REMOVED: localOrderedShotImages
  creatingTaskId: null,
  isSettingsModalOpen: false,
  isModeReady: false,
  settingsError: null,
  isEditingName: false,
  editingName: '',
  isTransitioningFromNameEdit: false,
  showStepsNotification: false,
  hasInitializedShot: null,
  hasInitializedUISettings: null,
});

// Reducer function
const shotEditorReducer = (state: ShotEditorState, action: ShotEditorAction): ShotEditorState => {
  switch (action.type) {
    case 'SET_UPLOADING_IMAGE':
      if (action.payload === state.isUploadingImage) return state;
      return { ...state, isUploadingImage: action.payload };
    case 'SET_UPLOAD_PROGRESS':
      if (action.payload === state.uploadProgress) return state;
      return { ...state, uploadProgress: action.payload };
    case 'SET_FILE_INPUT_KEY':
      if (action.payload === state.fileInputKey) return state;
      return { ...state, fileInputKey: action.payload };
    case 'SET_DELETING_VIDEO_ID':
      if (action.payload === state.deletingVideoId) return state;
      return { ...state, deletingVideoId: action.payload };
    case 'SET_DUPLICATING_IMAGE_ID':
      if (action.payload === state.duplicatingImageId) return state;
      return { ...state, duplicatingImageId: action.payload };
    case 'SET_DUPLICATE_SUCCESS_IMAGE_ID':
      if (action.payload === state.duplicateSuccessImageId) return state;
      return { ...state, duplicateSuccessImageId: action.payload };
    case 'SET_PENDING_FRAME_POSITIONS':
      // Prevent unnecessary re-renders by checking reference equality for Map
      if (action.payload === state.pendingFramePositions) {
        return state;
      }
      return { ...state, pendingFramePositions: action.payload };
    // REMOVED: SET_LOCAL_ORDERED_SHOT_IMAGES - no longer needed
    case 'SET_CREATING_TASK_ID':
      if (action.payload === state.creatingTaskId) return state;
      return { ...state, creatingTaskId: action.payload };
    case 'SET_SETTINGS_MODAL_OPEN':
      if (action.payload === state.isSettingsModalOpen) return state;
      return { ...state, isSettingsModalOpen: action.payload };
    case 'SET_MODE_READY':
      if (action.payload === state.isModeReady) return state;
      return { ...state, isModeReady: action.payload };
    case 'SET_SETTINGS_ERROR':
      if (action.payload === state.settingsError) return state;
      return { ...state, settingsError: action.payload };
    case 'SET_EDITING_NAME':
      if (action.payload === state.isEditingName) return state;
      return { ...state, isEditingName: action.payload };
    case 'SET_EDITING_NAME_VALUE':
      if (action.payload === state.editingName) return state;
      return { ...state, editingName: action.payload };
    case 'SET_TRANSITIONING_FROM_NAME_EDIT':
      if (action.payload === state.isTransitioningFromNameEdit) return state;
      return { ...state, isTransitioningFromNameEdit: action.payload };
    case 'SET_SHOW_STEPS_NOTIFICATION':
      if (action.payload === state.showStepsNotification) return state;
      return { ...state, showStepsNotification: action.payload };
    case 'SET_HAS_INITIALIZED_SHOT':
      if (action.payload === state.hasInitializedShot) return state;
      return { ...state, hasInitializedShot: action.payload };
    case 'SET_HAS_INITIALIZED_UI_SETTINGS':
      if (action.payload === state.hasInitializedUISettings) return state;
      return { ...state, hasInitializedUISettings: action.payload };
    default:
      return state;
  }
};

// Action creators type - exported for use in extracted hooks
export interface ShotEditorActions {
  setUploadingImage: (value: boolean) => void;
  setUploadProgress: (value: number) => void;
  setFileInputKey: (value: number) => void;
  setDeletingVideoId: (value: string | null) => void;
  setDuplicatingImageId: (value: string | null) => void;
  setDuplicateSuccessImageId: (value: string | null) => void;
  setPendingFramePositions: (value: Map<string, number>) => void;
  setCreatingTaskId: (value: string | null) => void;
  setSettingsModalOpen: (value: boolean) => void;
  setModeReady: (value: boolean) => void;
  setSettingsError: (value: string | null) => void;
  setEditingName: (value: boolean) => void;
  setEditingNameValue: (value: string) => void;
  setTransitioningFromNameEdit: (value: boolean) => void;
  setShowStepsNotification: (value: boolean) => void;
  setHasInitializedShot: (value: string | null) => void;
  setHasInitializedUISettings: (value: string | null) => void;
}

// Custom hook for state management
export const useShotEditorState = (): { state: ShotEditorState; actions: ShotEditorActions } => {
  const [state, dispatch] = useReducer(shotEditorReducer, createInitialState());

  // Action creators — each useCallback has [] deps so they're stable across renders.
  // The actions object itself must also be memoized to prevent downstream useMemo
  // invalidation (it's a dependency of the ShotSettingsContext value).
  const setUploadingImage = useCallback((value: boolean) => {
    dispatch({ type: 'SET_UPLOADING_IMAGE', payload: value });
  }, []);
  const setUploadProgress = useCallback((value: number) => {
    dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: value });
  }, []);
  const setFileInputKey = useCallback((value: number) => {
    dispatch({ type: 'SET_FILE_INPUT_KEY', payload: value });
  }, []);
  const setDeletingVideoId = useCallback((value: string | null) => {
    dispatch({ type: 'SET_DELETING_VIDEO_ID', payload: value });
  }, []);
  const setDuplicatingImageId = useCallback((value: string | null) => {
    dispatch({ type: 'SET_DUPLICATING_IMAGE_ID', payload: value });
  }, []);
  const setDuplicateSuccessImageId = useCallback((value: string | null) => {
    dispatch({ type: 'SET_DUPLICATE_SUCCESS_IMAGE_ID', payload: value });
  }, []);
  const setPendingFramePositions = useCallback((value: Map<string, number>) => {
    dispatch({ type: 'SET_PENDING_FRAME_POSITIONS', payload: value });
  }, []);
  const setCreatingTaskId = useCallback((value: string | null) => {
    dispatch({ type: 'SET_CREATING_TASK_ID', payload: value });
  }, []);
  const setSettingsModalOpen = useCallback((value: boolean) => {
    dispatch({ type: 'SET_SETTINGS_MODAL_OPEN', payload: value });
  }, []);
  const setModeReady = useCallback((value: boolean) => {
    dispatch({ type: 'SET_MODE_READY', payload: value });
  }, []);
  const setSettingsError = useCallback((value: string | null) => {
    dispatch({ type: 'SET_SETTINGS_ERROR', payload: value });
  }, []);
  const setEditingName = useCallback((value: boolean) => {
    dispatch({ type: 'SET_EDITING_NAME', payload: value });
  }, []);
  const setEditingNameValue = useCallback((value: string) => {
    dispatch({ type: 'SET_EDITING_NAME_VALUE', payload: value });
  }, []);
  const setTransitioningFromNameEdit = useCallback((value: boolean) => {
    dispatch({ type: 'SET_TRANSITIONING_FROM_NAME_EDIT', payload: value });
  }, []);
  const setShowStepsNotification = useCallback((value: boolean) => {
    dispatch({ type: 'SET_SHOW_STEPS_NOTIFICATION', payload: value });
  }, []);
  const setHasInitializedShot = useCallback((value: string | null) => {
    dispatch({ type: 'SET_HAS_INITIALIZED_SHOT', payload: value });
  }, []);
  const setHasInitializedUISettings = useCallback((value: string | null) => {
    dispatch({ type: 'SET_HAS_INITIALIZED_UI_SETTINGS', payload: value });
  }, []);

  // 🎯 PERF FIX: Memoize actions object — all callbacks have [] deps so this
  // object is truly stable. Without memoization, a new actions object every render
  // causes ShotSettingsContext value to change → all consumers re-render.
  const actions = useMemo<ShotEditorActions>(() => ({
    setUploadingImage,
    setUploadProgress,
    setFileInputKey,
    setDeletingVideoId,
    setDuplicatingImageId,
    setDuplicateSuccessImageId,
    setPendingFramePositions,
    setCreatingTaskId,
    setSettingsModalOpen,
    setModeReady,
    setSettingsError,
    setEditingName,
    setEditingNameValue,
    setTransitioningFromNameEdit,
    setShowStepsNotification,
    setHasInitializedShot,
    setHasInitializedUISettings,
  }), [
    setUploadingImage, setUploadProgress, setFileInputKey, setDeletingVideoId,
    setDuplicatingImageId, setDuplicateSuccessImageId, setPendingFramePositions,
    setCreatingTaskId, setSettingsModalOpen, setModeReady, setSettingsError,
    setEditingName, setEditingNameValue, setTransitioningFromNameEdit,
    setShowStepsNotification, setHasInitializedShot, setHasInitializedUISettings,
  ]);

  return {
    state,
    actions,
  };
}; 
