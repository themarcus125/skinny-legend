import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ApiClient, UserDto } from '@skinny/api-client';
import { ApiError } from '@/lib/live-client';
import { SessionProvider } from '@/auth/session';
import { ApiProvider } from '@/lib/api';
import { makeUser, stubApi, stubAuthPort } from '@/test/session';
import { render, screen, waitFor } from '@/test/intl';
import { isValidName, ProfileEditSheet } from './profile-edit';

const USER: UserDto = makeUser();

beforeEach(() => {
  // `SessionProvider` reconciles the language on every session load (ruling R18). jsdom reports
  // `en-US`, so a browser that has never chosen would PATCH `/me { locale: 'en' }` and muddy the
  // assertions below; this one has already chosen the seed user's own language.
  localStorage.setItem('skinny.locale', 'vi');
  convert.mockClear();
});

/**
 * jsdom has no canvas, so the 512 px downscale cannot actually run here; the seam is injected and
 * asserted on instead. `upload.ts` owns the geometry, this file owns the wiring.
 */
const convert = vi.fn((file: Blob) =>
  Promise.resolve(new Blob([file], { type: 'image/jpeg' })),
);

function renderSheet(api: ApiClient, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <SessionProvider auth={stubAuthPort()}>{children}</SessionProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  return {
    onClose,
    ...render(<ProfileEditSheet user={USER} onClose={onClose} convert={convert} />, {
      wrapper: Wrapper,
    }),
  };
}

function jpeg(sizeBytes?: number): File {
  const file = new File([new Uint8Array([1, 2, 3])], 'avatar.jpg', { type: 'image/jpeg' });
  // Faking `size` rather than allocating 11 MB of test heap; nothing downstream reads the bytes.
  if (sizeBytes !== undefined) Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('the profile edit sheet', () => {
  it('saves a new display name and closes', async () => {
    const updateMe = vi.fn((patch: unknown) => Promise.resolve({ ...USER, ...(patch as object) }));
    const { onClose } = renderSheet(stubApi({ session: () => Promise.resolve(USER), updateMe }));

    const field = screen.getByLabelText('Tên hiển thị');
    await userEvent.clear(field);
    await userEvent.type(field, 'Khoa Ngô');
    await userEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ displayName: 'Khoa Ngô' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('presigns, uploads and PATCHes a new avatar, showing progress', async () => {
    let finishUpload: (() => void) | undefined;
    const presign = vi.fn(() =>
      Promise.resolve({ key: 'avatars/u1/a.jpg', url: 'https://r2.test/put', expiresAt: '' }),
    );
    const uploadToPresign = vi.fn(
      (_url: string, _file: Blob, _type: string, onProgress?: (fraction: number) => void) =>
        new Promise<void>((resolve) => {
          onProgress?.(0.5);
          finishUpload = () => resolve();
        }),
    );
    const updateMe = vi.fn(() => Promise.resolve(USER));
    renderSheet(
      stubApi({ session: () => Promise.resolve(USER), presign, uploadToPresign, updateMe }),
    );

    await userEvent.upload(screen.getByLabelText('Đổi ảnh đại diện'), jpeg());
    expect(await screen.findByTestId('avatar-preview')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('profile-save'));

    // Mid-flight: the bar is standing and `/me` has not been touched yet.
    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0.5');
    expect(updateMe).not.toHaveBeenCalled();

    finishUpload?.();
    // Every avatar is re-encoded, JPEG included: the point of the conversion is the 512 px
    // downscale, not the format.
    expect(convert).toHaveBeenCalled();
    await waitFor(() => expect(presign).toHaveBeenCalledWith({ kind: 'avatar', contentType: 'image/jpeg' }));
    // One PATCH carries the new key; the unchanged name is left out (`patchMeBody` takes either).
    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ avatarKey: 'avatars/u1/a.jpg' }));
  });

  it('refuses a source file over 10 MB before it presigns anything', async () => {
    const presign = vi.fn();
    const updateMe = vi.fn(() => Promise.resolve(USER));
    renderSheet(stubApi({ session: () => Promise.resolve(USER), presign, updateMe }));

    await userEvent.upload(screen.getByLabelText('Đổi ảnh đại diện'), jpeg(11 * 1024 * 1024));
    await userEvent.click(screen.getByTestId('profile-save'));

    // The API's own code, so the screen renders the catalog message it already has.
    expect(await screen.findByText('Ảnh không hợp lệ, hãy chọn ảnh khác.')).toBeInTheDocument();
    expect(presign).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();
    expect(updateMe).not.toHaveBeenCalled();
  });

  it('rejects an empty name and a name over 40 characters without calling the API', async () => {
    const updateMe = vi.fn(() => Promise.resolve(USER));
    renderSheet(stubApi({ session: () => Promise.resolve(USER), updateMe }));

    const field = screen.getByLabelText('Tên hiển thị');
    await userEvent.clear(field);
    expect(screen.getByTestId('profile-save')).toBeDisabled();

    // Whitespace alone is empty too, and a blank save is never sent.
    await userEvent.type(field, '   ');
    expect(screen.getByTestId('profile-save')).toBeDisabled();
    await userEvent.click(screen.getByTestId('profile-save'));
    expect(updateMe).not.toHaveBeenCalled();

    // Over the API's own bound: `maxLength` stops the field at 40 so it cannot even be typed,
    // and the validator behind the button rejects it however it got there (a paste, autofill).
    await userEvent.clear(field);
    await userEvent.type(field, 'x'.repeat(41));
    expect((field as HTMLInputElement).value).toHaveLength(40);
    expect(isValidName('x'.repeat(41))).toBe(false);
    expect(isValidName('')).toBe(false);
    expect(isValidName(' Khoa ')).toBe(true);
  });

  it('surfaces an upload failure as a retryable banner and keeps the picked photo', async () => {
    const presign = vi.fn(() =>
      Promise.resolve({ key: 'avatars/u1/a.jpg', url: 'https://r2.test/put', expiresAt: '' }),
    );
    const uploadToPresign = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'upload_failed', 'nope'))
      .mockResolvedValueOnce(undefined);
    const updateMe = vi.fn(() => Promise.resolve(USER));
    renderSheet(
      stubApi({ session: () => Promise.resolve(USER), presign, uploadToPresign, updateMe }),
    );

    await userEvent.upload(screen.getByLabelText('Đổi ảnh đại diện'), jpeg());
    await userEvent.click(screen.getByTestId('profile-save'));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Không lưu được, hãy thử lại.');
    expect(banner).toHaveTextContent('Tải ảnh lên thất bại.');
    expect(updateMe).not.toHaveBeenCalled();

    // "Thử lại" re-runs the whole save, upload included — the member never re-picks the file.
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ avatarKey: 'avatars/u1/a.jpg' }));
  });
});
