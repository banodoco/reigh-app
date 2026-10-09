import { type ReactNode } from 'react';
import { VideoEditorShell } from '@/tools/video-editor/components/VideoEditorShell.tsx';
import {
  BrowserVideoEditorProvider,
  type BrowserVideoEditorProviderProps,
} from '@/tools/video-editor/browser/BrowserVideoEditorProvider.tsx';

export type BrowserVideoEditorLayoutRenderer = (shell: ReactNode) => ReactNode;

export interface BrowserVideoEditorProps extends Omit<BrowserVideoEditorProviderProps, 'children'> {
  mode?: 'full' | 'compact';
  onCreateTimeline?: () => void;
  renderLayout?: BrowserVideoEditorLayoutRenderer;
  children?: ReactNode;
}

/**
 * @publicContract
 * Standalone browser bootstrap that mounts the real editor shell from injected services.
 */
export function BrowserVideoEditor({
  mode = 'full',
  onCreateTimeline,
  renderLayout,
  children,
  ...providerProps
}: BrowserVideoEditorProps) {
  const { timelineId } = providerProps;
  const shell = children ?? <VideoEditorShell mode={mode} timelineId={timelineId} onCreateTimeline={onCreateTimeline} />;

  return (
    <BrowserVideoEditorProvider {...providerProps}>
      {renderLayout ? renderLayout(shell) : shell}
    </BrowserVideoEditorProvider>
  );
}
