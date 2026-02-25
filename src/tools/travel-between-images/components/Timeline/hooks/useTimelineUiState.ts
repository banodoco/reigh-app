import { useCallback, useMemo, useReducer } from 'react';

interface TimelineUiState {
  resetGap: number;
  showVideoBrowser: boolean;
  isUploadingStructureVideo: boolean;
}

type TimelineUiAction =
  | { type: 'set_reset_gap'; value: number }
  | { type: 'set_show_video_browser'; value: boolean }
  | { type: 'set_is_uploading_structure_video'; value: boolean };

const DEFAULT_RESET_GAP = 50;
const DEFAULT_MAX_GAP = 81;

function reducer(state: TimelineUiState, action: TimelineUiAction): TimelineUiState {
  switch (action.type) {
    case 'set_reset_gap':
      return {
        ...state,
        resetGap: action.value,
      };
    case 'set_show_video_browser':
      return {
        ...state,
        showVideoBrowser: action.value,
      };
    case 'set_is_uploading_structure_video':
      return {
        ...state,
        isUploadingStructureVideo: action.value,
      };
    default:
      return state;
  }
}

export function useTimelineUiState() {
  const [state, dispatch] = useReducer(reducer, {
    resetGap: DEFAULT_RESET_GAP,
    showVideoBrowser: false,
    isUploadingStructureVideo: false,
  });

  const setResetGap = useCallback((value: number) => {
    dispatch({ type: 'set_reset_gap', value });
  }, []);

  const setShowVideoBrowser = useCallback((value: boolean) => {
    dispatch({ type: 'set_show_video_browser', value });
  }, []);

  const setIsUploadingStructureVideo = useCallback((value: boolean) => {
    dispatch({ type: 'set_is_uploading_structure_video', value });
  }, []);

  return useMemo(() => ({
    resetGap: state.resetGap,
    setResetGap,
    maxGap: DEFAULT_MAX_GAP,
    showVideoBrowser: state.showVideoBrowser,
    setShowVideoBrowser,
    isUploadingStructureVideo: state.isUploadingStructureVideo,
    setIsUploadingStructureVideo,
  }), [
    setIsUploadingStructureVideo,
    setResetGap,
    setShowVideoBrowser,
    state.isUploadingStructureVideo,
    state.resetGap,
    state.showVideoBrowser,
  ]);
}
