import { fireEvent, render, screen } from '@/test/intl';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/lib/api/types';
import { AddEntryDialog } from './add-entry-dialog';

function member(id: string, displayName: string, overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    firebaseUid: `fb-${id}`,
    displayName,
    avatarKey: null,
    role: 'member',
    status: 'active',
    locale: 'vi',
    createdAt: '2026-09-08T06:30:00+07:00',
    ...overrides,
  } as AdminUser;
}

const MEMBERS = [member('u-1', 'Minh'), member('u-2', 'Quỳnh')];
const CHALLENGE = { startDate: '2026-09-08', endDate: '2026-12-25' };
/** The dialog opens on "now"; the tests pin it so the default time is assertable. */
const NOW = new Date('2026-09-29T04:30:00.000Z');

function renderDialog(props: Partial<Parameters<typeof AddEntryDialog>[0]> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <AddEntryDialog
      open
      members={MEMBERS}
      challenge={CHALLENGE}
      now={NOW}
      isSaving={false}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave, onClose };
}

async function pickMember(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: /Thành viên/ }));
  await user.click(await screen.findByRole('option', { name }));
}

describe('AddEntryDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on the current challenge time and cannot be saved until a member and a category are picked', async () => {
    renderDialog();

    expect(screen.getByLabelText('Thời gian')).toHaveValue('2026-09-29T11:30');
    const save = screen.getByRole('button', { name: 'Thêm mục ghi' });
    expect(save).toBeDisabled();

    await pickMember('Quỳnh');
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole('switch', { name: 'Thể thao' }));
    expect(save).toBeEnabled();
  });

  it('saves the member, time, categories and text with no photo', async () => {
    const { onSave } = renderDialog();

    await pickMember('Quỳnh');
    fireEvent.change(screen.getByLabelText('Thời gian'), { target: { value: '2026-09-26T17:00' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Thể thao' }));
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Pilates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mục ghi' }));

    expect(onSave).toHaveBeenCalledWith(
      { userId: 'u-2', takenAt: '2026-09-26T17:00:00+07:00', categories: ['exercise'], title: 'Pilates' },
      null,
    );
  });

  it('hands the chosen photo over beside the entry', async () => {
    const { onSave } = renderDialog();
    const file = new File(['x'], 'pilates.jpg', { type: 'image/jpeg' });

    await pickMember('Minh');
    fireEvent.click(screen.getByRole('switch', { name: 'Bữa ăn lành mạnh' }));
    await userEvent.upload(screen.getByLabelText('Ảnh (không bắt buộc)'), file);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mục ghi' }));

    const [input, photo] = onSave.mock.calls[0] as [{ userId: string; categories: string[] }, File | null];
    expect(input).toMatchObject({ userId: 'u-1', categories: ['meal'] });
    expect(photo).toBe(file);
  });

  it('warns when the chosen day is outside the challenge, since it will score nothing', () => {
    renderDialog();
    expect(screen.queryByTestId('outside-challenge')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Thời gian'), { target: { value: '2026-08-02T16:56' } });
    expect(screen.getByTestId('outside-challenge')).toHaveTextContent(
      'Ngày này nằm ngoài thử thách (08/09/2026 – 25/12/2026) nên mục ghi sẽ không được tính điểm.',
    );
  });

  it('will not save a time in the future', async () => {
    renderDialog();

    await pickMember('Minh');
    fireEvent.click(screen.getByRole('switch', { name: 'Thể thao' }));
    fireEvent.change(screen.getByLabelText('Thời gian'), { target: { value: '2026-09-30T08:00' } });

    expect(screen.getByRole('button', { name: 'Thêm mục ghi' })).toBeDisabled();
    expect(screen.getByText('Thời gian không được ở tương lai.')).toBeInTheDocument();
  });

  it('only offers members who can score', () => {
    renderDialog({ members: [...MEMBERS, member('u-3', 'Khách', { status: 'pending' })] });
    // Base UI renders the closed select's items lazily, so the rule is asserted on the prop.
    expect(screen.getByTestId('add-entry-form')).toHaveAttribute('data-member-count', '2');
  });
});
