import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '@/lib/api';
import type { AdminEntryInput, AdminEntryResult } from '@/lib/api/types';
import { earnedLabel, saveNewEntry } from './save-entry';

const INPUT: AdminEntryInput = { userId: 'u-1', takenAt: '2026-09-26T17:00:00+07:00', categories: ['exercise'] };
const RESULT = { entry: { id: 'e-9' }, points: 3, capped: false } as unknown as AdminEntryResult;

function api() {
  return {
    presign: vi.fn(async () => ({ key: 'photos/adm/p.jpg', url: 'https://r2.test/put', expiresAt: '' })),
    uploadToPresign: vi.fn(async () => undefined),
    addEntry: vi.fn(async () => RESULT),
  };
}

describe('saveNewEntry', () => {
  it('adds the entry straight away when there is no photo', async () => {
    const client = api();
    await expect(saveNewEntry(client as unknown as AdminApi, INPUT, null)).resolves.toBe(RESULT);
    expect(client.presign).not.toHaveBeenCalled();
    expect(client.uploadToPresign).not.toHaveBeenCalled();
    expect(client.addEntry).toHaveBeenCalledWith(INPUT);
  });

  it('uploads the photo first and attaches its key', async () => {
    const client = api();
    const photo = new File(['x'], 'p.png', { type: 'image/png' });
    await saveNewEntry(client as unknown as AdminApi, INPUT, photo);
    expect(client.presign).toHaveBeenCalledWith({ kind: 'photo', contentType: 'image/png' });
    expect(client.uploadToPresign).toHaveBeenCalledWith('https://r2.test/put', photo, 'image/png');
    expect(client.addEntry).toHaveBeenCalledWith({ ...INPUT, photoKey: 'photos/adm/p.jpg' });
  });

  it('adds nothing when the upload fails', async () => {
    const client = api();
    client.uploadToPresign.mockRejectedValueOnce(new Error('network'));
    await expect(saveNewEntry(client as unknown as AdminApi, INPUT, new File(['x'], 'p.jpg', { type: 'image/jpeg' }))).rejects.toThrow('network');
    expect(client.addEntry).not.toHaveBeenCalled();
  });

  it('refuses a file type the API cannot take before asking for an upload URL', async () => {
    const client = api();
    await expect(saveNewEntry(client as unknown as AdminApi, INPUT, new File(['x'], 'p.gif', { type: 'image/gif' }))).rejects.toMatchObject({ code: 'photo_invalid' });
    expect(client.presign).not.toHaveBeenCalled();
  });
});

describe('earnedLabel', () => {
  it('picks the capped wording only when a cap zeroed the entry', () => {
    expect(earnedLabel({ points: 3, capped: false })).toEqual({ key: 'entries.earned', values: { points: 3 } });
    expect(earnedLabel({ points: 0, capped: true })).toEqual({ key: 'entries.earnedCapped', values: { points: 0 } });
  });
});
