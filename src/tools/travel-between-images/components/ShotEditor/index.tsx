import React from 'react';
import { ShotEditorProps } from './state/types';
import { ShotEditorLayout } from './ShotEditorLayout';
import { useShotEditorController } from './useShotEditorController';

const ShotSettingsEditor: React.FC<ShotEditorProps> = (props) => {
  const { hasSelectedShot, layoutProps } = useShotEditorController(props);

  if (!hasSelectedShot) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Shot not found</p>
      </div>
    );
  }

  return <ShotEditorLayout {...layoutProps} />;
};

export { ShotSettingsEditor };
export default ShotSettingsEditor;
export const ShotEditor = ShotSettingsEditor;
