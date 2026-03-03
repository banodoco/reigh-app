/**
 * HeaderSection - Shot header with navigation and name editing
 *
 * Extracted from ShotSettingsEditor for modularity.
 * Gets most data from ShotSettingsContext, only takes callback props.
 */

import React from 'react';
import { Header } from '../ui/Header';
import { useShotSettingsContext } from '../ShotSettingsContext';

interface HeaderSectionProps {
  callbacks: {
    onBack: () => void;
    onPreviousShot?: () => void;
    onNextShot?: () => void;
    hasPrevious?: boolean;
    hasNext?: boolean;
    onUpdateShotName?: (name: string) => void;
    onNameClick: () => void;
    onNameSave: () => void;
    onNameCancel: (e?: React.MouseEvent) => void;
    onNameKeyDown: (e: React.KeyboardEvent) => void;
  };
  layout: {
    headerContainerRef?: (node: HTMLDivElement | null) => void;
    centerSectionRef: React.RefObject<HTMLDivElement>;
    isSticky?: boolean;
  };
}

export const HeaderSection: React.FC<HeaderSectionProps> = ({
  callbacks,
  layout,
}) => {
  // Get shared state from context
  const { selectedShot, state, actions, effectiveAspectRatio, projectId } = useShotSettingsContext();

  return (
    <div ref={layout.headerContainerRef}>
      <Header
        selectedShot={selectedShot}
        isEditingName={state.isEditingName}
        editingName={state.editingName}
        isTransitioningFromNameEdit={state.isTransitioningFromNameEdit}
        onBack={callbacks.onBack}
        onUpdateShotName={callbacks.onUpdateShotName}
        onPreviousShot={callbacks.onPreviousShot}
        onNextShot={callbacks.onNextShot}
        hasPrevious={callbacks.hasPrevious}
        hasNext={callbacks.hasNext}
        onNameClick={callbacks.onNameClick}
        onNameSave={callbacks.onNameSave}
        onNameCancel={callbacks.onNameCancel}
        onNameKeyDown={callbacks.onNameKeyDown}
        onEditingNameChange={actions.setEditingNameValue}
        projectAspectRatio={effectiveAspectRatio}
        projectId={projectId}
        centerSectionRef={layout.centerSectionRef}
        isSticky={layout.isSticky}
      />
    </div>
  );
};
