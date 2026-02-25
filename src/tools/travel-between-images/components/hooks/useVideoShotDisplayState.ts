import { useEffect, useReducer } from 'react';

interface VideoShotDisplayState {
  isEditingName: boolean;
  editableName: string;
  isDeleteDialogOpen: boolean;
  isVideoModalOpen: boolean;
  showVideo: boolean;
  isFinalVideoLightboxOpen: boolean;
  skipConfirmationChecked: boolean;
  isSelectedForAddition: boolean;
}

type VideoShotDisplayAction =
  | { type: 'sync_shot_name'; shotName: string }
  | { type: 'start_name_edit' }
  | { type: 'cancel_name_edit'; shotName: string }
  | { type: 'set_editable_name'; value: string }
  | { type: 'finish_name_edit' }
  | { type: 'set_delete_dialog_open'; open: boolean }
  | { type: 'set_skip_confirmation_checked'; checked: boolean }
  | { type: 'set_video_modal_open'; open: boolean }
  | { type: 'set_show_video'; show: boolean }
  | { type: 'set_final_video_lightbox_open'; open: boolean }
  | { type: 'set_selected_for_addition'; selected: boolean };

interface UseVideoShotDisplayStateInput {
  shotId: string;
  shotName: string;
  selectedShotId?: string | null;
  isGenerationsPaneLocked: boolean;
}

function createInitialState(shotName: string): VideoShotDisplayState {
  return {
    isEditingName: false,
    editableName: shotName,
    isDeleteDialogOpen: false,
    isVideoModalOpen: false,
    showVideo: false,
    isFinalVideoLightboxOpen: false,
    skipConfirmationChecked: false,
    isSelectedForAddition: false,
  };
}

function reducer(state: VideoShotDisplayState, action: VideoShotDisplayAction): VideoShotDisplayState {
  switch (action.type) {
    case 'sync_shot_name': {
      if (state.isEditingName || state.editableName === action.shotName) {
        return state;
      }
      return {
        ...state,
        editableName: action.shotName,
      };
    }
    case 'start_name_edit':
      return {
        ...state,
        isEditingName: true,
      };
    case 'cancel_name_edit':
      return {
        ...state,
        isEditingName: false,
        editableName: action.shotName,
      };
    case 'set_editable_name':
      return {
        ...state,
        editableName: action.value,
      };
    case 'finish_name_edit':
      return {
        ...state,
        isEditingName: false,
      };
    case 'set_delete_dialog_open':
      return {
        ...state,
        isDeleteDialogOpen: action.open,
        skipConfirmationChecked: action.open ? state.skipConfirmationChecked : false,
      };
    case 'set_skip_confirmation_checked':
      return {
        ...state,
        skipConfirmationChecked: action.checked,
      };
    case 'set_video_modal_open':
      return {
        ...state,
        isVideoModalOpen: action.open,
      };
    case 'set_show_video':
      return {
        ...state,
        showVideo: action.show,
      };
    case 'set_final_video_lightbox_open':
      return {
        ...state,
        isFinalVideoLightboxOpen: action.open,
      };
    case 'set_selected_for_addition':
      return {
        ...state,
        isSelectedForAddition: action.selected,
      };
    default:
      return state;
  }
}

export function useVideoShotDisplayState({
  shotId,
  shotName,
  selectedShotId,
  isGenerationsPaneLocked,
}: UseVideoShotDisplayStateInput) {
  const [state, dispatch] = useReducer(reducer, shotName, createInitialState);

  useEffect(() => {
    dispatch({ type: 'sync_shot_name', shotName });
  }, [shotName]);

  useEffect(() => {
    if (!isGenerationsPaneLocked) {
      dispatch({ type: 'set_selected_for_addition', selected: false });
      return;
    }
    if (selectedShotId === undefined) {
      dispatch({ type: 'set_selected_for_addition', selected: false });
      return;
    }
    dispatch({ type: 'set_selected_for_addition', selected: selectedShotId === shotId });
  }, [isGenerationsPaneLocked, selectedShotId, shotId]);

  return {
    ...state,
    startNameEdit: () => dispatch({ type: 'start_name_edit' }),
    cancelNameEdit: (nextShotName: string) => dispatch({ type: 'cancel_name_edit', shotName: nextShotName }),
    setEditableName: (value: string) => dispatch({ type: 'set_editable_name', value }),
    finishNameEdit: () => dispatch({ type: 'finish_name_edit' }),
    setDeleteDialogOpen: (open: boolean) => dispatch({ type: 'set_delete_dialog_open', open }),
    setSkipConfirmationChecked: (checked: boolean) => dispatch({ type: 'set_skip_confirmation_checked', checked }),
    setVideoModalOpen: (open: boolean) => dispatch({ type: 'set_video_modal_open', open }),
    setShowVideo: (show: boolean) => dispatch({ type: 'set_show_video', show }),
    setFinalVideoLightboxOpen: (open: boolean) => dispatch({ type: 'set_final_video_lightbox_open', open }),
    setSelectedForAddition: (selected: boolean) => dispatch({ type: 'set_selected_for_addition', selected }),
  };
}
