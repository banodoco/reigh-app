import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SequenceParamEditor } from '@/tools/video-editor/components/PropertiesPanel/SequenceParamEditor';
import { getRegisteredClipTypeDescriptor } from '@/tools/video-editor/clip-types/runtime';

vi.mock('@/shared/components/ui/input', () => ({
  Input: ({ onChange, value, ...props }: ComponentProps<'input'>) => (
    <input value={value} onChange={onChange} {...props} />
  ),
}));

vi.mock('@/shared/components/ui/textarea', () => ({
  Textarea: ({ onChange, value, ...props }: ComponentProps<'textarea'>) => (
    <textarea value={value} onChange={onChange} {...props} />
  ),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => <button {...props}>{children}</button>,
}));

describe('Astrid catalog parameters in the sequence Inspector', () => {
  it('shows the catalog label and commits schema-valid keyframes while retaining invalid drafts', () => {
    const descriptor = getRegisteredClipTypeDescriptor('animated-media-transform');
    const params = descriptor?.defaults.params;
    const onChange = vi.fn();
    render(
      <SequenceParamEditor
        clipType="animated-media-transform"
        params={params}
        registry={{}}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Animated Media Transform')).toBeInTheDocument();
    const keyframes = screen.getByLabelText('Keyframes');
    fireEvent.change(keyframes, { target: { value: '[{"at":0,"x":1}]' } });
    expect(screen.getByRole('alert')).toHaveTextContent('is required');
    expect(onChange).not.toHaveBeenCalled();

    const valid = '[{"at":0,"x":0,"y":0,"width":1920,"height":1080,"opacity":1},{"at":1,"x":20,"y":0,"width":1800,"height":1000,"opacity":0.8}]';
    fireEvent.change(keyframes, { target: { value: valid } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keyframes: JSON.parse(valid),
    }));
  });
});
