import { z } from 'zod';
import { CATEGORIES, type Category } from '../scoring/types.js';

/**
 * The literal tuples the DB enums and every wire schema share. They live here, not in
 * db/schema.ts, so a browser client can import the contract without pulling in drizzle.
 * Keep them value-for-value in step with packages/shared/src/db/schema.ts.
 *
 * `CATEGORIES`/`Category` are re-exported from scoring/types.js rather than redeclared:
 * a second declaration would make the package's star exports ambiguous.
 */
export { CATEGORIES, type Category };

export const PLACE_SOURCES = ['poi', 'geocode', 'manual', 'none'] as const;
export const USER_LOCALES = ['vi', 'en'] as const;
export const DEVICE_PLATFORMS = ['ios'] as const;
export const ENTRY_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export const USER_STATUSES = ['pending', 'active', 'disabled'] as const;
export const ROLES = ['member', 'admin'] as const;

export type PlaceSource = (typeof PLACE_SOURCES)[number];
export type UserLocale = (typeof USER_LOCALES)[number];
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type Role = (typeof ROLES)[number];

export const categorySchema = z.enum(['exercise', 'meal', 'group']);
export const placeSourceSchema = z.enum(PLACE_SOURCES);
export const localeSchema = z.enum(USER_LOCALES);
export const platformSchema = z.enum(DEVICE_PLATFORMS);
/** Every cursor on this API is the previous page's last `takenAt`/`createdAt`, ISO with offset. */
export const cursorSchema = z.string().datetime({ offset: true });
