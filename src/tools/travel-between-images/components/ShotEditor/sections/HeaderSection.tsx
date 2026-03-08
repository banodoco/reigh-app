/**
 * HeaderSection - Shot header with navigation and name editing
 *
 * Extracted from ShotSettingsEditor for modularity.
 * Gets most data from ShotSettingsContext, only takes callback props.
 */

import React from 'react';
import { Header } from '../ui/Header';
import { useShotSettingsContext } from '../ShotSettingsContext';
import type { HeaderSectionCallbacks, HeaderSectionLayout } from './headerSectionTypes';

interface HeaderSectionProps {
  callbacks: HeaderSectionCallbacks;
  layout: HeaderSectionLayout;
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
