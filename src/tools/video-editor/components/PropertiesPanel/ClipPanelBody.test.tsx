import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClipPanelBody, type ClipPanelBodyProps } from './ClipPanelBody.tsx';
import {
  ClipTypeRegistryProvider,
  useClipTypeRegistryContext,
} from '@/tools/video-editor/clip-types/ClipTypeRegistryContext.tsx';
import type { ClipTypeRegistryRecord } from '@/tools/video-editor/clip-types/ClipTypeRegistry.ts';

vi.mock('./ClipEntranceEffectField.tsx', () => ({ ClipEntranceEffectField: () => null }));
vi.mock('./ClipExitEffectField.tsx', () => ({ ClipExitEffectField: () => null }));
vi.mock('./ClipContinuousEffectField.tsx', () => ({ ClipContinuousEffectField: () => null }));
vi.mock('./ClipShaderSection.tsx', () => ({ ClipShaderSection: () => null }));
vi.mock('./ClipTransitionSection.tsx', () => ({ ClipTransitionSection: () => null }));

const EXTENSION_CLIP_TYPE = 'com.reigh.astrid.liveScene';
const EXTENSION_RECORD: ClipTypeRegistryRecord = {
  clipTypeId: EXTENSION_CLIP_TYPE,
  contributionId: 'astrid.live-scenes.clip-type',
  ownerExtensionId: 'com.reigh.astrid.live-scenes',
  renderer: {},
  schema: [{ name: 'sceneId', label: 'Scene', description: '', type: 'string' } as never],
  renderability: { capabilities: [], defaultRoute: 'preview', determinism: 'preview-only' },
  status: 'active',
};

function ExtensionRegistration({ active }: { active: boolean }) {
  const { registry } = useClipTypeRegistryContext();
  useEffect(() => {
    if (!active) return;
    return registry.register(EXTENSION_RECORD).dispose;
  }, [active, registry]);
  return null;
}

function bodyProps(clipType: string): ClipPanelBodyProps {
  return {
    readOnly: false,
    clip: { id: 'clip-1', clipType, at: 0, track: 'visual' },
    track: { id: 'visual', kind: 'visual', label: 'Visual' },
    deviceClass: 'desktop',
    interactionMode: 'move',
    precisionEnabled: false,
    hasPredecessor: false,
    onChange: () => undefined,
    onResetPosition: () => undefined,
    onClose: () => undefined,
    onToggleMute: () => undefined,
    onSplitAtPlayhead: () => undefined,
    onMoveTrackUp: () => undefined,
    onMoveTrackDown: () => undefined,
    onSetInteractionMode: () => undefined,
    onSetPrecisionEnabled: () => undefined,
    compositionWidth: 1920,
    compositionHeight: 1080,
    registry: {},
    activeTab: 'effects',
    setActiveTab: () => undefined,
    effectResources: { canCreateEffect: false, canUpdateEffect: false, effects: [] },
  } as unknown as ClipPanelBodyProps;
}

function Harness({ clipType, extensionActive = false }: { clipType: string; extensionActive?: boolean }) {
  return (
    <ClipTypeRegistryProvider>
      <ExtensionRegistration active={extensionActive} />
      <ClipPanelBody {...bodyProps(clipType)} />
    </ClipTypeRegistryProvider>
  );
}

function renderBody(clipType: string, extensionActive = false) {
  return render(<Harness clipType={clipType} extensionActive={extensionActive} />);
}

describe('ClipPanelBody live clip type descriptors', () => {
  it('recognizes provider-registered extension clips and restores the unknown warning when removed', async () => {
    const view = renderBody(EXTENSION_CLIP_TYPE, true);
    const warning = `${EXTENSION_CLIP_TYPE} is not registered in the clip-type registry for this editor build.`;

    await waitFor(() => expect(screen.queryByText(warning)).not.toBeInTheDocument());

    view.rerender(<Harness clipType={EXTENSION_CLIP_TYPE} extensionActive={false} />);

    await waitFor(() => expect(screen.getByText(warning)).toBeInTheDocument());
  });

  it.each(['media', 'resource-card'])(
    'keeps built-in and trusted clip type %s recognized without an unregistered warning',
    (clipType) => {
      renderBody(clipType);
      expect(screen.queryByText(`${clipType} is not registered in the clip-type registry for this editor build.`)).not.toBeInTheDocument();
    },
  );

  it('keeps the warning for an unknown clip type with no provider record', () => {
    renderBody('com.example.missing-clip');
    expect(screen.getByText('com.example.missing-clip is not registered in the clip-type registry for this editor build.')).toBeInTheDocument();
  });
});
