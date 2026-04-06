import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ParameterControls, getDefaultValues } from '@/tools/video-editor/components/ParameterControls';
import { validateAndCoerceParams } from '@/tools/video-editor/effects/validateParams';
import type { ParameterSchema } from '@/tools/video-editor/types';

describe('audio-binding parameter support', () => {
  it('validates valid bindings, falls back invalid bindings, and preserves existing parameter coercion', () => {
    const schema: ParameterSchema = [
      { name: 'size', label: 'Size', description: 'Effect size', type: 'number', default: 2, min: 0, max: 5 },
      {
        name: 'binding',
        label: 'Binding',
        description: 'Maps audio into a range',
        type: 'audio-binding',
        default: { source: 'amplitude', min: 0, max: 1 },
      },
    ];

    expect(validateAndCoerceParams({
      size: 9,
      binding: { source: 'treble', min: 2, max: 4 },
    }, schema)).toEqual({
      size: 5,
      binding: { source: 'treble', min: 2, max: 4 },
    });

    expect(validateAndCoerceParams({
      size: 'bad',
      binding: { source: 'noise', min: 'bad', max: null },
    }, schema)).toEqual({
      size: 2,
      binding: { source: 'amplitude', min: 0, max: 1 },
    });
  });

  it('renders the audio-binding controls with NumberInput-backed min/max fields', () => {
    const schema: ParameterSchema = [
      {
        name: 'binding',
        label: 'Binding',
        description: 'Maps audio into a range',
        type: 'audio-binding',
        default: { source: 'amplitude', min: 0, max: 1 },
      },
    ];

    render(
      <ParameterControls
        schema={schema}
        values={getDefaultValues(schema)}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Binding')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Min')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(2);
    expect(textboxes.map((input) => (input as HTMLInputElement).value)).toEqual(['0', '1']);
  });
});
