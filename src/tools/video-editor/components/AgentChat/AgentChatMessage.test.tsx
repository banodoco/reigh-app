// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildAttachedSummary } from '@/tools/video-editor/hooks/useSelectedMediaClips.ts';
import { recordedEditorResults } from '../../runtime/editorRequestPresentation';
import { AgentChatAttachmentStrip, AgentChatMessage, AgentChatToolGroup } from './AgentChatMessage';

describe('AgentChatMessage', () => {
  it('renders assistant Markdown with headings, lists, emphasis, code, and tables', () => {
    render(
      <AgentChatMessage
        turn={{
          role: 'assistant',
          content: '## Timeline\n\n- **at:** `0.5s`\n- **end:** 7.0667s\n\n| field | value |\n| --- | --- |\n| version | 62 |\n\n```text\nversion 62\n```',
          timestamp: '2026-04-04T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Timeline', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('at:')).toBeInTheDocument();
    expect(screen.getByText('0.5s')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('version 62')).toBeInTheDocument();
    expect(screen.getByText('version 62').tagName).toBe('CODE');
  });

  it('renders attachment summaries for gallery-style attachments that include generationId', () => {
    render(
      <AgentChatMessage
        turn={{
          role: 'assistant',
          content: 'I used your selected references.',
          attachments: [
            {
              clipId: 'gallery-gen-1',
              url: 'https://example.com/image.png',
              mediaType: 'image',
              generationId: 'gen-1',
            },
            {
              clipId: 'gallery-gen-2',
              url: 'https://example.com/video.mp4',
              mediaType: 'video',
              generationId: 'gen-2',
            },
          ],
          timestamp: '2026-04-04T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('I used your selected references.')).toBeInTheDocument();
    expect(screen.getByLabelText('Attached image 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Attached video 2')).toBeInTheDocument();
    expect(screen.getByText('1 image, 1 video attached')).toBeInTheDocument();
  });

  it('collapses extra attachment previews behind a count badge', () => {
    render(
      <AgentChatMessage
        turn={{
          role: 'user',
          content: 'Use these attachments.',
          attachments: [
            { clipId: 'clip-1', url: 'https://example.com/1.png', mediaType: 'image' },
            { clipId: 'clip-2', url: 'https://example.com/2.png', mediaType: 'image' },
            { clipId: 'clip-3', url: 'https://example.com/3.png', mediaType: 'image' },
            { clipId: 'clip-4', url: 'https://example.com/4.png', mediaType: 'image' },
            { clipId: 'clip-5', url: 'https://example.com/5.png', mediaType: 'image' },
          ],
          timestamp: '2026-04-04T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getAllByLabelText(/Attached image \d/)).toHaveLength(4);
    expect(screen.getByLabelText('1 more attachments')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('5 images attached')).toBeInTheDocument();
  });

  it('renders shot-aware attachment summaries when a whole shot was attached', () => {
    render(
      <AgentChatMessage
        turn={{
          role: 'user',
          content: 'Use this shot and these extras.',
          attachments: [
            { clipId: 'shot-1-a', url: 'https://example.com/1.png', mediaType: 'image', shotId: 'shot-1', shotSelectionClipCount: 4 },
            { clipId: 'shot-1-b', url: 'https://example.com/2.png', mediaType: 'image', shotId: 'shot-1', shotSelectionClipCount: 4 },
            { clipId: 'shot-1-c', url: 'https://example.com/3.png', mediaType: 'image', shotId: 'shot-1', shotSelectionClipCount: 4 },
            { clipId: 'shot-1-d', url: 'https://example.com/4.png', mediaType: 'image', shotId: 'shot-1', shotSelectionClipCount: 4 },
            { clipId: 'clip-5', url: 'https://example.com/5.png', mediaType: 'image' },
            { clipId: 'clip-6', url: 'https://example.com/6.png', mediaType: 'image' },
          ],
          timestamp: '2026-04-04T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('1 shot (4 images) and 2 more images attached')).toBeInTheDocument();
  });

  it('excludes every attachment from a completed shot summary when siblings omit selection metadata', () => {
    render(
      <AgentChatMessage
        turn={{
          role: 'user',
          content: 'Use these',
          timestamp: '2026-09-27T00:00:00.000Z',
          attachments: [
            { clipId: 'shot-a', url: 'https://example.com/a.png', mediaType: 'image', shotId: 'shot-1', shotSelectionClipCount: 2 },
            { clipId: 'shot-b', url: 'https://example.com/b.png', mediaType: 'image', shotId: 'shot-1', shotSelectionClipCount: 2 },
            { clipId: 'shot-extra', url: 'https://example.com/c.mp4', mediaType: 'video', shotId: 'shot-1' },
            { clipId: 'outside', url: 'https://example.com/d.mp4', mediaType: 'video' },
          ],
        }}
      />,
    );

    expect(screen.getByText('1 shot (2 images) and 1 more video attached')).toBeInTheDocument();
    expect(screen.queryByText('1 shot (2 images) and 2 more videos attached')).not.toBeInTheDocument();
  });

  it.each([
    ['uniform negative', [-2, -2]],
    ['uniform fractional', [1.5, 1.5]],
    ['mixed negative and valid', [-2, 1]],
    ['mixed fractional and valid', [1.5, 1]],
  ])('matches the original app summary for %s shot selection metadata', (_label, counts) => {
    const attachments = [
      { clipId: 'shot-a', url: 'https://example.com/a.png', mediaType: 'image' as const, shotId: 'shot-1', shotSelectionClipCount: counts[0] },
      { clipId: 'shot-b', url: 'https://example.com/b.mp4', mediaType: 'video' as const, shotId: 'shot-1', shotSelectionClipCount: counts[1] },
    ];
    const baseline = buildAttachedSummary(attachments);
    expect(baseline).not.toBeNull();

    render(
      <AgentChatMessage
        turn={{
          role: 'user',
          content: 'Use these malformed metadata fixtures',
          timestamp: '2026-09-27T00:00:00.000Z',
          attachments,
        }}
      />,
    );

    expect(screen.getByText(baseline!)).toBeInTheDocument();
  });

  it('calls the attachment click handler for clickable previews', () => {
    const onAttachmentClick = vi.fn();

    render(
      <AgentChatMessage
        turn={{
          role: 'assistant',
          content: 'I used your selected references.',
          attachments: [
            {
              clipId: 'gallery-gen-1',
              url: 'https://example.com/image.png',
              mediaType: 'image',
              generationId: 'gen-1',
            },
          ],
          timestamp: '2026-04-04T12:00:00.000Z',
        }}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open attached image 1' }));

    expect(onAttachmentClick).toHaveBeenCalledWith({
      clipId: 'gallery-gen-1',
      url: 'https://example.com/image.png',
      mediaType: 'image',
      generationId: 'gen-1',
    });
  });

  it('renders full-shot selections inside a grouped bounding box', () => {
    render(
      <AgentChatAttachmentStrip
        attachments={[
          { clipId: 'shot-1-a', url: 'https://example.com/1.png', mediaType: 'image', shotId: 'shot-1', shotName: 'Hero Shot', shotSelectionClipCount: 2 },
          { clipId: 'shot-1-b', url: 'https://example.com/2.png', mediaType: 'image', shotId: 'shot-1', shotName: 'Hero Shot', shotSelectionClipCount: 2 },
          { clipId: 'clip-3', url: 'https://example.com/3.png', mediaType: 'image' },
        ]}
        isUser={false}
        maxPreviewCount={null}
      />,
    );

    expect(screen.getByLabelText('Hero Shot group')).toBeInTheDocument();
    expect(screen.getByText('Hero Shot (2)')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Attached image \d/)).toHaveLength(3);
  });

  it('calls remove handlers for individual items and whole shots', () => {
    const onRemoveAttachment = vi.fn();
    const onRemoveShot = vi.fn();

    render(
      <AgentChatAttachmentStrip
        attachments={[
          { clipId: 'shot-1-a', url: 'https://example.com/1.png', mediaType: 'image', shotId: 'shot-1', shotName: 'Hero Shot', shotSelectionClipCount: 2 },
          { clipId: 'shot-1-b', url: 'https://example.com/2.png', mediaType: 'image', shotId: 'shot-1', shotName: 'Hero Shot', shotSelectionClipCount: 2 },
          { clipId: 'clip-3', url: 'https://example.com/3.png', mediaType: 'image' },
        ]}
        isUser={false}
        onRemoveAttachment={onRemoveAttachment}
        onRemoveShot={onRemoveShot}
        maxPreviewCount={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deselect Hero Shot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deselect attached image 2' }));

    expect(onRemoveShot).toHaveBeenCalledWith('shot-1');
    expect(onRemoveAttachment).toHaveBeenCalledWith({
      clipId: 'clip-3',
      url: 'https://example.com/3.png',
      mediaType: 'image',
    });
  });

  it('renders placeholder attachment chips as loading slots without media bindings or remove controls', () => {
    const onRemoveAttachment = vi.fn();

    render(
      <AgentChatAttachmentStrip
        attachments={[
          {
            clipId: 'pending-clip',
            url: '',
            mediaType: 'image',
            isPlaceholder: true,
          },
        ]}
        isUser={false}
        onRemoveAttachment={onRemoveAttachment}
        maxPreviewCount={null}
      />,
    );

    const loadingSlot = screen.getByLabelText('Attached image 1');

    expect(within(loadingSlot).getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading attached image 1')).toBeInTheDocument();
    expect(loadingSlot.querySelector('img')).not.toBeInTheDocument();
    expect(loadingSlot.querySelector('video')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deselect attached image 1' })).not.toBeInTheDocument();
  });

  it('renders non-placeholder attachment chips with media bindings and remove controls', () => {
    const onRemoveAttachment = vi.fn();

    render(
      <AgentChatAttachmentStrip
        attachments={[
          {
            clipId: 'real-clip',
            url: 'https://example.com/real.png',
            mediaType: 'image',
          },
        ]}
        isUser={false}
        onRemoveAttachment={onRemoveAttachment}
        maxPreviewCount={null}
      />,
    );

    const chip = screen.getByLabelText('Attached image 1');
    const image = chip.querySelector('img');

    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/real.png');
    fireEvent.click(screen.getByRole('button', { name: 'Deselect attached image 1' }));
    expect(onRemoveAttachment).toHaveBeenCalledWith({
      clipId: 'real-clip',
      url: 'https://example.com/real.png',
      mediaType: 'image',
    });
  });

  it('reserves the same chip dimensions for placeholder and real attachment slots', () => {
    render(
      <AgentChatAttachmentStrip
        attachments={[
          {
            clipId: 'pending-clip',
            url: '',
            mediaType: 'image',
            isPlaceholder: true,
          },
          {
            clipId: 'real-clip',
            url: 'https://example.com/real.mp4',
            mediaType: 'video',
          },
        ]}
        isUser={false}
        maxPreviewCount={null}
      />,
    );

    const placeholderSurface = screen.getByLabelText('Attached image 1').parentElement;
    const realSurface = screen.getByLabelText('Attached video 2').parentElement;

    expect(placeholderSurface).toHaveClass('h-10', 'w-10');
    expect(realSurface).toHaveClass('h-10', 'w-10');
  });
});


describe('collapsed action groups', () => {
  const pair = (id: string, status = 'completed') => ({
    call: { role: 'tool_call' as const, content: `Read file ${id}`, tool_call_id: id, timestamp: id, tool_args: { path: `${id}.ts` } },
    result: { role: 'tool_result' as const, content: `${id} full output\n${'x'.repeat(160)} END-${id}`, timestamp: id, tool_status: status },
  });
  it('collapses single and multiple calls, counts calls once and expands full input/results/errors', () => {
    const view = render(<AgentChatToolGroup pairs={[pair('one')]} />);
    expect(screen.getByRole('button', { name: '[1 action]' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/full output/)).toBeNull();
    view.rerender(<AgentChatToolGroup pairs={[pair('one'), pair('two', 'failed')]} />);
    const toggle = screen.getByRole('button', { name: '[2 actions]' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(toggle).getByText('1 failed')).toHaveClass('text-destructive');
    expect(toggle.querySelectorAll('svg')).toHaveLength(1); // Terminal only; no disclosure arrow next to Download.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByRole('region', { name: 'Action details' });
    expect(details.id).toBe(toggle.getAttribute('aria-controls'));
    expect(details).toHaveTextContent('END-one'); expect(details).toHaveTextContent('END-two');
    expect(details).toHaveTextContent('"path": "one.ts"');
    expect(within(details).getByText('Failed')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole('region')).toBeNull();
  });
  it('shows native child failure in the disclosure and expanded details despite a completed transport', () => {
    const native = { ...pair('review'), result: { ...pair('review').result, tool_output_details: { projectAgentsDir: null, totalDurationMs: 50, results: [{ id: 'Review', agent: 'reviewer', exitCode: 1 }] } } };
    render(<AgentChatToolGroup pairs={[native]} />);
    const toggle = screen.getByRole('button', {name: '[1 action]'});
    expect(within(toggle).getByText('1 failed')).toHaveClass('text-destructive');
    fireEvent.click(toggle);
    expect(within(screen.getByRole('region', {name: 'Action details'})).getByText('Failed')).toBeInTheDocument();
  });
  it('downloads only the clicked live group snapshot without toggling disclosure',async()=>{
    let captured:Blob|undefined;const names:string[]=[];
    const originalCreate=Object.getOwnPropertyDescriptor(URL,'createObjectURL');const originalRevoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL');
    const create=vi.fn((blob:Blob)=>{captured=blob;return 'blob:action-group';});const revoke=vi.fn();
    Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){names.push(this.download);});
    try{
      const view=render(<><AgentChatToolGroup pairs={[pair('one')]}/><AgentChatToolGroup pairs={[pair('other-private-group')]}/></>);
      view.rerender(<><AgentChatToolGroup pairs={[pair('one','failed'),{call:pair('live-two').call,result:null}]}/><AgentChatToolGroup pairs={[pair('other-private-group')]}/></>);
      const toggle=screen.getByRole('button',{name:'[2 actions]'});expect(toggle).toHaveAttribute('aria-expanded','false');
      fireEvent.click(screen.getAllByRole('button',{name:'Download logs for this action group'})[0]);
      expect(toggle).toHaveAttribute('aria-expanded','false');expect(screen.queryByRole('region')).not.toBeInTheDocument();
      expect(captured?.type).toBe('text/plain;charset=utf-8');expect(names[0]).toMatch(/^action-logs-.*\.txt$/);expect(revoke).toHaveBeenCalledWith('blob:action-group');
      const text=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(captured!);});
      expect(text).toContain('Actions: 2');expect(text).toContain('Status: failed');expect(text).toContain('END-one');expect(text).toContain('"path": "live-two.ts"');
      expect(text).toContain('Call observed at: live-two');expect(text).toContain('Result observed at: one');expect(text).toContain('(pending at capture)');expect(text).not.toContain('other-private-group');
    }finally{
      click.mockRestore();if(originalCreate)Object.defineProperty(URL,'createObjectURL',originalCreate);else Reflect.deleteProperty(URL,'createObjectURL');
      if(originalRevoke)Object.defineProperty(URL,'revokeObjectURL',originalRevoke);else Reflect.deleteProperty(URL,'revokeObjectURL');
    }
  });
  it('updates live call count/status without forcing open and retains explicit expanded state', () => {
    const pending = { call: pair('one').call, result: null };
    const view = render(<AgentChatToolGroup pairs={[pending]} />);
    expect(screen.getByText('1 running')).toBeInTheDocument();
    view.rerender(<AgentChatToolGroup pairs={[pair('one'), { call: pair('two').call, result: null }]} />);
    const toggle = screen.getByRole('button', { name: '[2 actions]' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    view.rerender(<AgentChatToolGroup pairs={[pair('one'), pair('two'), pair('three')]} />);
    expect(screen.getByRole('button', { name: '[3 actions]' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Actions finished')).toBeInTheDocument();
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });
});

describe('saved editor request presentation', () => {
  const scope = { sessionId: 's', turnId: 't', projectId: 'p', timelineId: 'timeline', capturedTimelineVersion: 7 };
  const request = { schema: 'astrid.live-scene-request/v1', requestId: 'request', action: 'read', scope, placementIds: ['scene'] };
  const content = `Before prose.\n<astrid_live_scene_request>${JSON.stringify(request)}</astrid_live_scene_request>\nAfter prose.`;
  const turn = { role: 'assistant' as const, timestamp: '2026-10-15T12:00:00Z', content };
  it('keeps prose visible and collapses a valid unhandled envelope as an unconfirmed action without executing it', () => {
    render(<AgentChatMessage turn={turn} />);
    expect(screen.getByText(/Before prose/)).toBeInTheDocument();
    expect(screen.getByText(/After prose/)).toBeInTheDocument();
    expect(screen.getByText('1 unconfirmed')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /1 action/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Editor request')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByText('Editor request')).toBeInTheDocument();
    expect(screen.getByText(/Execution is unconfirmed/)).toBeInTheDocument();
    expect(screen.getByText(/"placementIds"/)).toBeInTheDocument();
  });
  it('uses an exact persisted scope/request result and preserves failure details, never a different scope', () => {
    const feedback = (changedScope = scope) => `<astrid_live_scene_result>${JSON.stringify({ schema: 'astrid.live-scene-result/v1', scope: changedScope,
      results: [{ requestId: 'request', ok: false, error: 'Scene does not exist' }] })}</astrid_live_scene_result>`;
    const recorded = recordedEditorResults([feedback()], 'p', 's');
    const view = render(<AgentChatMessage turn={turn} recordedResults={recorded} />);
    expect(screen.getByText('1 failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1 action/ }));
    expect(screen.getByText(/Scene does not exist/)).toBeInTheDocument();
    view.rerender(<AgentChatMessage turn={turn} recordedResults={recordedEditorResults([feedback({ ...scope, turnId: 'different' })], 'p', 's')} />);
    expect(screen.getByText('1 unconfirmed')).toBeInTheDocument();
    expect(recordedEditorResults([feedback()], 'wrong-project', 's')).toEqual([]);
  });
  it('leaves malformed or unrelated envelopes visible for diagnosis', () => {
    render(<AgentChatMessage turn={{ ...turn, content: 'Visible <astrid_live_scene_request>{broken}</astrid_live_scene_request>' }} />);
    expect(screen.getByText(/broken/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions?/ })).not.toBeInTheDocument();
  });
});

describe('saved Elements operation presentation', () => {
  it('collapses valid create/validate/apply source requests once each, without treating Done prose as a host receipt', () => {
    const operations = [
      { name: 'elements.create_draft', id: 'blocks', label: 'Blocks', kind: 'effect', source: 'const Blocks = () => <div />;' },
      { name: 'elements.validate', draft_id: 'blocks' },
      { name: 'timeline.apply_element', project: 'p', timeline: 't', expected_version: 7,
        element: { id: 'blocks', kind: 'effect', revision: 'draft-blocks' }, placement: 'overlay', at: 0, duration: 2 },
    ];
    render(<AgentChatMessage turn={{ role: 'assistant', timestamp: '2026-10-15T12:00:00Z',
      content: 'Done. ' + operations.map(operation => `<astrid_element_operation>${JSON.stringify(operation)}</astrid_element_operation>`).join('\n') }} />);
    expect(screen.getByText('Done.')).toBeInTheDocument();
    expect(screen.getByText('3 unconfirmed')).toBeInTheDocument();
    expect(screen.queryByText(/const Blocks/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '[3 actions]' }));
    expect(screen.getByText(/const Blocks/)).toBeInTheDocument();
    expect(screen.getAllByText(/Opening these details does not execute/)).toHaveLength(3);
    expect(screen.getByText('Editor request · timeline.apply_element')).toBeInTheDocument();
  });
});
