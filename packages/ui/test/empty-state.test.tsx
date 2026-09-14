import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../src/index';

describe('<EmptyState>', () => {
  it('renders the title alone', () => {
    render(<EmptyState title="Chưa có hoạt động" />);
    expect(screen.getByText('Chưa có hoạt động')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-description')).not.toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-action')).not.toBeInTheDocument();
  });

  it('renders the description and the action when given', () => {
    render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        title="Chưa có hoạt động"
        description="Ghi lại buổi tập đầu tiên."
        action={<button type="button">Thêm</button>}
      />,
    );
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
    expect(screen.getByText('Ghi lại buổi tập đầu tiên.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeInTheDocument();
  });
});
