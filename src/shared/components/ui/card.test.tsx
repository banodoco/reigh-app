import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

describe('Card', () => {
  it('renders card primitives and forwards custom classes', () => {
    render(
      <Card className="custom-card" data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    const card = screen.getByTestId('card');
    expect(card.className).toContain('custom-card');
    expect(screen.getByText('Description').tagName.toLowerCase()).toBe('p');
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    render(<Card variant="wes-simple" data-testid="card" />);
    const card = screen.getByTestId('card');

    expect(card.className).toContain('backdrop-blur-sm');
    expect(card.className).toContain('border-2');
  });
});
