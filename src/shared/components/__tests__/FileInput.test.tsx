import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileInput from '../FileInput';

describe('FileInput', () => {
  it('renders label and accepted types copy', () => {
    const onFileChange = vi.fn();

    render(
      <FileInput
        onFileChange={onFileChange}
        acceptTypes={['image', 'video']}
        label="Uploads"
      />
    );

    expect(screen.getByLabelText('Uploads')).toBeInTheDocument();
    expect(screen.getByText('Accepted: image, video')).toBeInTheDocument();
  });
});
