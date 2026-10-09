import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AvailableSequenceMetadata } from '@/tools/video-editor/sequences/registry.ts';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { SequenceParamEditor } from './SequenceParamEditor.tsx';

const metadata = (params: AvailableSequenceMetadata['params']): AvailableSequenceMetadata => ({
  clipType: 'legacy-sequence',
  themeId: '2rp',
  label: 'Legacy Sequence',
  description: 'Legacy sequence fields.',
  whenToUse: 'Legacy test fixture.',
  hold: { defaultSeconds: 2, minSeconds: 1, maxSeconds: 4, stepSeconds: 1 },
  params,
});

describe('SequenceParamEditor empty legacy state', () => {
  it('keeps the warning when there is no active matching Astrid schema form', () => {
    render(
      <SequenceParamEditor
        clipType="unregistered-test-sequence"
        metadata={metadata([])}
        params={{}}
        registry={{} as ResolvedTimelineConfig['registry']}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText('This clip type does not expose editable sequence params in the current registry view.')).toBeInTheDocument();
  });

  it('suppresses only the empty-state warning when an exact editable Astrid schema form is active', () => {
    const { container } = render(
      <SequenceParamEditor
        clipType="unregistered-test-sequence"
        metadata={metadata([])}
        params={{}}
        registry={{} as ResolvedTimelineConfig['registry']}
        hideEmptyState
        onChange={() => undefined}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('This clip type does not expose editable sequence params in the current registry view.')).not.toBeInTheDocument();
  });

  it('preserves nonempty legacy controls even when an Astrid schema form is also active', () => {
    render(
      <SequenceParamEditor
        clipType="unregistered-test-sequence"
        metadata={metadata([{
          key: 'legacyTitle',
          label: 'Legacy title',
          kind: 'string',
          description: 'A legacy parameter.',
          defaultValue: 'Keep me',
        }])}
        params={{}}
        registry={{} as ResolvedTimelineConfig['registry']}
        hideEmptyState
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText('Legacy Sequence')).toBeInTheDocument();
    expect(screen.getByText('Legacy title')).toBeInTheDocument();
    expect(screen.queryByText('This clip type does not expose editable sequence params in the current registry view.')).not.toBeInTheDocument();
  });
});
