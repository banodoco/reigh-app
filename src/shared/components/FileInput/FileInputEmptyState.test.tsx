import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FileInputEmptyState } from './FileInputEmptyState';

describe('FileInputEmptyState', () => {
  it('shows singular upload copy and accepted types when allowed', () => {
    render(
      <FileInputEmptyState
        multiple={false}
        acceptTypes={['image', 'video']}
        suppressAcceptedTypes={false}
      />,
    );

    expect(screen.getByText('Drag & drop or click to upload a file')).toBeInTheDocument();
    expect(screen.getByText('Accepted: image, video')).toBeInTheDocument();
  });

  it('shows plural upload copy and suppresses accepted types when requested', () => {
    render(
      <FileInputEmptyState
        multiple
        acceptTypes={['image']}
        suppressAcceptedTypes
      />,
    );

    expect(screen.getByText('Drag & drop or click to upload files')).toBeInTheDocument();
    expect(screen.queryByText(/Accepted:/)).not.toBeInTheDocument();
  });
});
