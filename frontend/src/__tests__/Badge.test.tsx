import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/common/Badge';

describe('Badge component', () => {
  it('renders badge content', () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders dot indicator when dot prop is true', () => {
    const { container } = render(<Badge variant="success" dot>Online</Badge>);
    const dot = container.querySelector('.rounded-full');
    expect(dot).toBeInTheDocument();
  });

  it('renders task status correctly', () => {
    render(<Badge status="COMPLETED" />);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });
});
