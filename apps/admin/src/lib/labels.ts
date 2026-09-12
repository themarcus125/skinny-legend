import type { Category, EntryStatus, Role, UserStatus } from './api/types';

/**
 * Enum → message-key maps. The values are keys under `labels.*` in messages/*.json, never copy:
 * every consumer resolves them with a root translator (`useTranslations()` or `createTranslator`).
 */
export const CATEGORY_LABELS: Record<Category, string> = {
  exercise: 'labels.category.exercise',
  meal: 'labels.category.meal',
  group: 'labels.category.group',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pending: 'labels.userStatus.pending',
  active: 'labels.userStatus.active',
  disabled: 'labels.userStatus.disabled',
};

export const ROLE_LABELS: Record<Role, string> = {
  member: 'labels.role.member',
  admin: 'labels.role.admin',
};

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  pending: 'labels.entryStatus.pending',
  confirmed: 'labels.entryStatus.confirmed',
  rejected: 'labels.entryStatus.rejected',
};

/** The minimal translator shape pure helpers accept: a full `namespace.key` path in, copy out. */
export type Translate = (key: string) => string;

/** Resolves a whole label map at once — for the `items` prop of `<Select>`, which wants value → copy. */
export function translateLabels<K extends string>(labels: Record<K, string>, t: Translate): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(labels) as K[]) out[key] = t(labels[key]);
  return out;
}
