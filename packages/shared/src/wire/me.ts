import { z } from 'zod';
import { localeSchema, platformSchema, type DevicePlatform, type Role, type UserLocale, type UserStatus } from './primitives.js';

export const patchMeBody = z.object({
  displayName: z.string().min(1).max(40).optional(),
  avatarKey: z.string().min(1).optional(),
  locale: localeSchema.optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });
export type PatchMeInput = z.infer<typeof patchMeBody>;

export const registerDeviceBody = z.object({
  token: z.string().min(1).max(4096),
  platform: platformSchema.default('ios'),
  locale: localeSchema.default('vi'),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceBody>;

export interface UserDto {
  id: string;
  firebaseUid: string;
  displayName: string;
  avatarKey: string | null;
  role: Role;
  status: UserStatus;
  locale: UserLocale;
  createdAt: string;
}

export interface UserSummaryDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface DeviceDto {
  id: string;
  userId: string;
  token: string;
  platform: DevicePlatform;
  locale: UserLocale;
  createdAt: string;
  lastSeenAt: string;
}
