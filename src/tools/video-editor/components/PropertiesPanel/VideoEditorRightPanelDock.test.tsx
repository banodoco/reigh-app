import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { ExtensionManager } from '@/tools/video-editor/components/ExtensionManager';
import { defaultPreferences, type EditorPreferences } from '../../hooks/useEditorPreferences';
import { VideoEditorRightPanelDock } from './VideoEditorRightPanelDock';
import { VideoEditorPanelDisplayControl } from './VideoEditorPanelDisplayControl';
const state = vi.hoisted(() => ({ timelineData: {} as object | null, preferences: {} as EditorPreferences, selection: {} as {selectedClipIds?:Set<string>;selectedTrackId?:string|null;inspectorTarget?:{kind:string}|null}, update: (_next: EditorPreferences | ((current: EditorPreferences) => EditorPreferences)) => {}, inventory: null as null | Array<{extensionId:string; packageSource:string; packageState:string; packageMetadata?:{label:string}}>, extensions: [] as Array<{manifest:{id:string;label?:string}}>, toggle: vi.fn(async () => {}), refresh: vi.fn() }));
const panelKey = 'haus.astrid.transcript-lane:transcript-lane-panel';
vi.mock('./PropertiesPanel', () => ({ PropertiesPanel: () => <div>Inspector content</div> }));
vi.mock('./VideoEditorAssetPanelSurface', () => ({ VideoEditorAssetPanelSurface: (props: {activePanelKey: string | null; settingsByPanelKey: Record<string,{open:boolean;onOpenChange:(value:boolean)=>void}>}) => {
  const [draft, setDraft] = useState('');
  return <div hidden={!props.activePanelKey}><textarea aria-label="Retained draft" value={draft} onChange={(event) => setDraft(event.target.value)} /><button aria-label="Transcript settings" onClick={() => props.settingsByPanelKey[panelKey].onOpenChange(true)}>Settings</button><span>{props.settingsByPanelKey[panelKey]?.open ? 'Tool settings open' : 'Tool reading view'}</span></div>;
} }));
vi.mock('../../components/ExtensionManager', () => ({ ExtensionManager: () => <div>Manager inventory</div> }));
vi.mock('../../runtime/useVideoEditorRenderContext', () => ({ useVideoEditorAssetPanels: () => [{ extensionId: 'haus.astrid.transcript-lane', id: 'transcript-lane-panel', label: 'Transcript' }, { extensionId: 'example', id: 'beat', label: 'Beat Cue' }] }));
vi.mock('../../contexts/VideoEditorRuntimeContext', () => ({ useOptionalVideoEditorRuntime: () => ({ extensionRuntime: { extensions: state.extensions, packageStateInventory: state.inventory ?? [
  { extensionId: 'haus.astrid.transcript-lane', packageSource: 'direct', packageState: 'loaded', packageMetadata: {label:'Transcript'} },
  { extensionId: 'example', packageSource: 'installed', packageState: 'disabled-by-user', packageMetadata: {label:'Beat Cue'} },
] }, extensionStateRepository: { putEnablementState: state.toggle }, triggerExtensionRefresh: state.refresh }) }));
vi.mock('../../hooks/timelineStore', () => ({ useTimelineEditorData: () => ({ data: state.timelineData, preferences: state.preferences, ...state.selection }), useTimelineEditorOps: () => ({
  setSelectedRightPanelId: (id: string | null) => state.update((current) => ({ ...current, selectedRightPanelId: id, rightPanelTab: id ? id === 'host:properties' ? 'inspector' : 'extensions' : current.rightPanelTab, lastExtensionPanelId: id && id !== 'host:properties' ? id : current.lastExtensionPanelId })),
  setRightPanelLayoutSlot: (id: string, slot: 'compact' | 'dock') => state.update((current) => ({ ...current, rightPanelLayoutSlotsByPanelId: { ...current.rightPanelLayoutSlotsByPanelId, [id]: slot } })),
}) }));
function Harness({ initialPreferences = {}, selectedClipIds = [], inspectorTarget = null }: { initialPreferences?: Partial<EditorPreferences>; selectedClipIds?: string[]; inspectorTarget?: {kind:string}|null }) { const [preferences, update] = useState({ ...defaultPreferences, selectedRightPanelId: panelKey, lastExtensionPanelId: panelKey, rightPanelTab: 'extensions' as const, ...initialPreferences }); state.preferences = preferences; state.selection = { selectedClipIds: new Set(selectedClipIds), selectedTrackId: null, inspectorTarget }; state.update = update; return <div data-video-editor-instance="test"><button>Render</button><VideoEditorPanelDisplayControl visible={preferences.selectedRightPanelId === null} /><VideoEditorRightPanelDock leftPanelPresent={false} compactDock /></div>; }
function SharedManagerHarness() {
  const [managerOpen, setManagerOpen] = useState(false);
  const [preferences, update] = useState({ ...defaultPreferences, selectedRightPanelId: panelKey, lastExtensionPanelId: panelKey, rightPanelTab: 'extensions' as const });
  state.preferences = preferences;
  state.selection = { selectedClipIds: new Set(), selectedTrackId: null, inspectorTarget: null };
  state.update = update;
  return <>
    <VideoEditorRightPanelDock leftPanelPresent={false} compactDock onOpenExtensionManager={() => setManagerOpen(true)} extensionManagerOpen={managerOpen} />
    <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
      <DialogContent><DialogHeader><DialogTitle>Extensions</DialogTitle></DialogHeader><ExtensionManager /></DialogContent>
    </Dialog>
  </>;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.timelineData = {};
  state.inventory = null;
  state.extensions = [
    { manifest: { id: 'haus.astrid.live-scenes', label: 'Three.js Live Editor' } },
    { manifest: { id: 'haus.astrid.transcript-lane', label: 'Transcript' } },
  ];
}); afterEach(cleanup);
it('mounts extension panels only once the timeline has arrived, so they never show a false empty state', () => {
  state.timelineData = null;
  const view = render(<Harness />);
  expect(screen.queryByRole('textbox', { name: 'Retained draft' })).toBeNull();
  expect(screen.getByText('Inspector content')).toBeInTheDocument();
  state.timelineData = {};
  view.rerender(<Harness />);
  expect(screen.getByRole('textbox', { name: 'Retained draft' })).toBeInTheDocument();
});
it('separates Inspector/Extensions, limits tools to admitted panels and retains a draft across tabs and display changes', async () => {
  const user = userEvent.setup(); render(<Harness />);
  expect(screen.getByRole('tab', {name:'Extensions'})).toHaveAttribute('aria-selected','true');
  expect(screen.getByRole('tablist').parentElement).toContainElement(screen.getByRole('button', {name:'Panel display'}));
  const active = screen.getByRole('button', {name:'Active extension'});
  const manage = screen.getByRole('button', {name:'Manage extensions'});
  expect(active).toHaveTextContent('Active · Transcript');
  expect(manage).toHaveTextContent('Manage');
  expect(active).toHaveClass('flex-1'); expect(manage.parentElement).toHaveClass('flex-1');
  expect(screen.getByRole('button', {name:'Active extension'}).parentElement).not.toContainElement(screen.getByRole('button', {name:'Panel display'}));
  const draft = screen.getByRole('textbox', {name:'Retained draft'}); fireEvent.change(draft, {target:{value:'Unsent draft'}});
  screen.getByRole('button',{name:'Active extension'}).focus(); await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitemradio',{name:'Transcript'})).toBeTruthy(); expect(screen.getByRole('menuitemradio',{name:'Beat Cue'})).toBeTruthy(); expect(screen.queryByRole('menuitemradio',{name:'Properties'})).toBeNull(); expect(screen.queryByRole('menuitemradio',{name:'Closed'})).toBeNull();
  await user.keyboard('{Escape}'); await user.click(screen.getByRole('tab',{name:'Inspector'})); expect(draft).not.toBeVisible();
  await user.click(screen.getByRole('tab',{name:'Extensions'})); expect(screen.getByRole('textbox',{name:'Retained draft'})).toBe(draft);
  screen.getByRole('button',{name:'Panel display'}).focus(); await user.keyboard('{ArrowDown}'); await user.click(screen.getByRole('menuitemradio',{name:'Compact'}));
  expect(screen.getByRole('region',{name:'Video editor right panel'})).toHaveAttribute('data-layout','compact');
  screen.getByRole('button',{name:'Panel display'}).focus(); await user.keyboard('{ArrowDown}'); await user.click(screen.getByRole('menuitemradio',{name:'Closed'}));
  expect(draft).not.toBeVisible(); expect(screen.getByRole('button',{name:'Panel display'})).toBeTruthy();
  expect(screen.queryByRole('tablist', {name:'Right panel surface'})).toBeNull();
  expect(screen.queryByRole('button', {name:'Manage extensions'})).toBeNull();
  screen.getByRole('button',{name:'Panel display'}).focus(); await user.keyboard('{ArrowDown}'); await user.click(screen.getByRole('menuitemradio',{name:'Compact'})); expect(screen.getByRole('textbox',{name:'Retained draft'})).toHaveValue('Unsent draft'); expect(screen.getByRole('region',{name:'Video editor right panel'})).toHaveAttribute('data-layout','compact');
});
it('opens the full extension manager directly and keeps tool settings through the retained seam', async () => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole('button',{name:'Manage extensions'}));
  expect(screen.getByRole('dialog', { name: 'Extensions' })).toHaveTextContent('Manager inventory');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button',{name:'Transcript settings'}));
  expect(screen.getByText('Tool settings open')).toBeTruthy();
});

it('delegates Manage to the host-shared manager dialog when the shared callback is supplied', async () => {
  const user = userEvent.setup(); render(<SharedManagerHarness />);
  await user.click(screen.getByRole('button', { name: 'Manage extensions' }));
  expect(screen.getAllByRole('dialog', { name: 'Extensions' })).toHaveLength(1);
  expect(screen.getByRole('dialog', { name: 'Extensions' })).toHaveTextContent('Manager inventory');
});

it('keeps the display menu open while the pointer moves to a mode and applies the click', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Panel display' }));
  const compact = await screen.findByRole('menuitemradio', { name: 'Compact' });
  // The parent can rerender while a menu is open (for example, when editor
  // selection or async extension state changes); the popup must retain identity.
  rerender(<Harness selectedClipIds={['clip-1']} />);
  expect(screen.getByRole('menuitemradio', { name: 'Compact' })).toBeVisible();
  await user.hover(compact);
  expect(screen.getByRole('menuitemradio', { name: 'Compact' })).toBeVisible();
  await user.click(compact);
  expect(screen.queryByRole('menuitemradio', { name: 'Compact' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Video editor right panel' })).toHaveAttribute('data-layout', 'compact');
});

it('shows enabled extension names on hover/focus and click opens the full existing manager', async () => {
  const user = userEvent.setup(); render(<Harness />);
  const manage = screen.getByRole('button', { name: 'Manage extensions' });
  await user.hover(manage);
  await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Enabled extensions'));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Three.js Live Editor');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Transcript');
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.unhover(manage);
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());

  await user.hover(manage);
  await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy());
  await user.click(manage);
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Extensions' })).toHaveTextContent('Manager inventory');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  manage.focus();
  await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy());
  fireEvent.keyDown(manage, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

it('states honestly when no extension is currently enabled', async () => {
  state.inventory = [{ extensionId: 'example', packageSource: 'installed', packageState: 'disabled-by-user' }];
  state.extensions = [];
  const user = userEvent.setup(); render(<Harness />);
  await user.hover(screen.getByRole('button', { name: 'Manage extensions' }));
  await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('No extensions are currently enabled.'));
  expect(screen.getByRole('tooltip')).not.toHaveTextContent('Transcript');
});

it('keeps the shared display mode across both Inspector and Extensions switches', async () => {
  const user = userEvent.setup();
  render(<Harness initialPreferences={{
    selectedRightPanelId: panelKey,
    rightPanelTab: 'extensions',
    // A pre-shared saved extension mode migrates when the tab is changed.
    rightPanelLayoutSlotsByPanelId: { [panelKey]: 'compact' },
  }} />);
  const panel = screen.getByRole('region', { name: 'Video editor right panel' });
  expect(panel).toHaveAttribute('data-layout', 'compact');
  expect(panel).toHaveAttribute('data-placement', 'upper-right-grid');
  expect((panel as HTMLElement).style.gridRow).toBe('1 / -1');
  expect((panel as HTMLElement).style.gridColumn).toBe('2');

  await user.click(screen.getByRole('tab', { name: 'Inspector' }));
  expect(panel).toHaveAttribute('data-layout', 'compact');
  expect(state.preferences.rightPanelLayoutSlotsByPanelId['host:properties']).toBe('compact');
  await user.click(screen.getByRole('tab', { name: 'Extensions' }));
  expect(panel).toHaveAttribute('data-layout', 'compact');
  expect(panel).toHaveAttribute('data-placement', 'upper-right-grid');

  // A direct display-control change is the only action that changes mode.
  screen.getByRole('button', { name: 'Panel display' }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('menuitemradio', { name: 'Full-height' }));
  expect(panel).toHaveAttribute('data-layout', 'dock');
  expect(panel).toHaveAttribute('data-placement', 'full-height-grid');
  expect((panel as HTMLElement).style.gridRow).toBe('1 / -1');
  await user.click(screen.getByRole('tab', { name: 'Inspector' }));
  expect(panel).toHaveAttribute('data-layout', 'dock');
  expect(panel).toHaveAttribute('data-placement', 'full-height-grid');
  await user.click(screen.getByRole('tab', { name: 'Extensions' }));
  expect(panel).toHaveAttribute('data-layout', 'dock');

  // Explicitly selecting Compact while on Inspector carries across Extensions.
  await user.click(screen.getByRole('tab', { name: 'Inspector' }));
  screen.getByRole('button', { name: 'Panel display' }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('menuitemradio', { name: 'Compact' }));
  expect(panel).toHaveAttribute('data-layout', 'compact');
  await user.click(screen.getByRole('tab', { name: 'Extensions' }));
  expect(panel).toHaveAttribute('data-layout', 'compact');
  expect(panel).toHaveAttribute('data-placement', 'upper-right-grid');
});

it('hints only when Extensions is active and the current selection is inspectable', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Harness selectedClipIds={['media-clip-1']} />);
  expect(screen.getByRole('tab', { name: 'Inspector — selection available' })).toBeTruthy();
  expect(screen.getByTestId('inspector-selection-hint')).toBeTruthy();

  await user.click(screen.getByRole('tab', { name: 'Inspector — selection available' }));
  expect(screen.queryByTestId('inspector-selection-hint')).toBeNull();
  expect(screen.getByRole('tab', { name: 'Inspector' })).toHaveAttribute('aria-selected', 'true');

  await user.click(screen.getByRole('tab', { name: 'Extensions' }));
  expect(screen.getByRole('tab', { name: 'Inspector — selection available' })).toBeTruthy();

  rerender(<Harness inspectorTarget={{ kind: 'dataItem' }} />);
  expect(screen.getByRole('tab', { name: 'Inspector — selection available' })).toBeTruthy();
  rerender(<Harness />);
  expect(screen.getByRole('tab', { name: 'Inspector' })).toBeTruthy();
  expect(screen.queryByTestId('inspector-selection-hint')).toBeNull();
});


it.each(['compact', 'dock'] as const)('reopens the retained extension from only the toolbar icon in %s mode', async (mode) => {
  const user = userEvent.setup();
  render(<Harness initialPreferences={{ rightPanelLayoutSlotsByPanelId: { 'host:properties': mode } }} />);
  const draft = screen.getByRole('textbox', { name: 'Retained draft' });
  await user.type(draft, 'Keep this correction');
  screen.getByRole('button', { name: 'Panel display' }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('menuitemradio', { name: 'Closed' }));
  const closedControl = screen.getByRole('button', { name: 'Panel display' });
  await waitFor(() => expect(closedControl).toHaveFocus());
  expect(screen.getByRole('button', { name: 'Render' }).nextElementSibling).toBe(closedControl);
  expect(screen.getAllByRole('button', { name: 'Panel display' })).toHaveLength(1);
  expect(screen.queryByRole('tab', { name: 'Inspector' })).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Extensions' })).toBeNull();
  expect(screen.getByTestId('video-editor-right-panel-dock')).toHaveAttribute('aria-hidden', 'true');
  expect(draft).toBeInTheDocument();
  expect(draft).not.toBeVisible();
  expect(state.preferences.rightPanelLayoutSlotsByPanelId['host:properties']).toBe(mode);
  closedControl.focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitemradio', { name: 'Closed' })).toHaveAttribute('aria-checked', 'true');
  await user.click(screen.getByRole('menuitemradio', { name: mode === 'compact' ? 'Compact' : 'Full-height' }));
  expect(state.preferences.selectedRightPanelId).toBe(panelKey);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Panel display' })).toHaveFocus());
  expect(screen.getByRole('textbox', { name: 'Retained draft' })).toBe(draft);
  expect(draft).toHaveValue('Keep this correction');
  expect(screen.getByRole('region', { name: 'Video editor right panel' })).toHaveAttribute('data-layout', mode);
  expect(screen.getAllByRole('button', { name: 'Panel display' })).toHaveLength(1);
});
