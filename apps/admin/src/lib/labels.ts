import type { Category, EntryStatus, Role, UserStatus } from './api/types';

export const CATEGORY_LABELS: Record<Category, string> = {
  exercise: 'Thể thao',
  meal: 'Bữa ăn lành mạnh',
  group: 'Hoạt động nhóm',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pending: 'Chờ duyệt',
  active: 'Hoạt động',
  disabled: 'Đã khoá',
};

export const ROLE_LABELS: Record<Role, string> = {
  member: 'Thành viên',
  admin: 'Quản trị',
};

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  rejected: 'Đã từ chối',
};
