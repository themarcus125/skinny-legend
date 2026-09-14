import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, AvatarStack } from '../src/index';

describe('<Avatar>', () => {
  it('falls back to the initial when src is null', () => {
    render(<Avatar name="Khoa" src={null} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('takes the last two words for a full name, as iOS does', () => {
    render(<Avatar name="Ngô Hà Khoa" />);
    expect(screen.getByText('HK')).toBeInTheDocument();
  });

  it('shows a "?" for an empty name', () => {
    render(<Avatar name="   " />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders the photo with the name as its alt text', () => {
    render(<Avatar name="Khoa" src="https://example.test/a.jpg" />);
    expect(screen.getByRole('img', { name: 'Khoa' })).toHaveAttribute('src', 'https://example.test/a.jpg');
  });
});

describe('<AvatarStack>', () => {
  const people = [{ name: 'An' }, { name: 'Bảo' }, { name: 'Chi' }, { name: 'Dũng' }, { name: 'Em' }];

  it('shows every face when the list fits', () => {
    render(<AvatarStack people={people.slice(0, 2)} max={3} />);
    expect(screen.getAllByTestId('avatar')).toHaveLength(2);
    expect(screen.queryByTestId('avatar-stack-overflow')).not.toBeInTheDocument();
  });

  it('shows `max` faces then a +N pill', () => {
    render(<AvatarStack people={people} max={3} />);
    expect(screen.getAllByTestId('avatar')).toHaveLength(3);
    expect(screen.getByTestId('avatar-stack-overflow')).toHaveTextContent('+2');
  });
});
