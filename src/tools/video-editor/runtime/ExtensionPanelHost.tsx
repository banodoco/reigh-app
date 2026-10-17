import { useId } from 'react';
import type { PanelRenderProps, PanelVideoAdapter } from '@astrid/editor-sdk';
import type { VideoEditorPanelDescriptor } from './extensionSurface';
import {
  HostContributionErrorBoundary,
  type ContributionErrorInfo,
} from './ContributionErrorBoundary';

/** Stable contribution identity for selection/preferences within a host. */
export function getPanelKey(panel: Pick<VideoEditorPanelDescriptor, 'extensionId' | 'id'>): string {
  return `${panel.extensionId ?? 'host'}:${panel.id}`;
}

export interface ExtensionPanelHostProps {
  /** Include registered panels even while hidden. Removal ends their lifetime. */
  readonly panels: readonly VideoEditorPanelDescriptor[];
  readonly visiblePanelKeys: ReadonlySet<string>;
  readonly video?: PanelVideoAdapter;
  readonly settingsByPanelKey?: Readonly<Record<string, PanelRenderProps['settings']>>;
  readonly onError?: (info: ContributionErrorInfo) => void;
}

function PanelContent({ panel, ...props }: PanelRenderProps & { panel: VideoEditorPanelDescriptor }) {
  return panel.render(props);
}

/** One React instance per qualified contribution in each mounted host. */
export function ExtensionPanelHost({ panels, visiblePanelKeys, video, onError, settingsByPanelKey }: ExtensionPanelHostProps) {
  const hostId = useId();
  return panels.map((panel) => {
    const key = getPanelKey(panel);
    const visible = visiblePanelKeys.has(key);
    return (
      <div className="h-full min-h-0 flex-col" style={{ display: visible ? 'flex' : 'none' }} key={key} hidden={!visible} data-video-editor-panel-id={panel.id} data-panel-key={key}>
        <HostContributionErrorBoundary
          contributionId={panel.id}
          extensionId={panel.extensionId}
          kind="panel"
          label={panel.label}
          onError={onError}
        >
          <PanelContent panel={panel} instanceId={`${hostId}:${key}`} visible={visible} video={video} settings={settingsByPanelKey?.[key]} />
        </HostContributionErrorBoundary>
      </div>
    );
  });
}
