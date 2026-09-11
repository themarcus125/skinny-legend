import { ApiError } from './client';

const FALLBACK = 'Đã có lỗi xảy ra. Vui lòng thử lại.';

/**
 * The API's `message` is English (apps/api/src/errors.ts), and user-facing copy is Vietnamese,
 * so nothing renders `error.message` directly. Only the codes the dashboard can actually receive
 * are listed: `pending_approval` is unreachable here because `requireActive` guards the member
 * routes only, never `/auth/session` or `/admin/*`.
 */
const MESSAGES: Record<string, string> = {
  unauthenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  forbidden: 'Tài khoản này không có quyền quản trị.',
  disabled: 'Tài khoản này đã bị khoá.',
  invalid_body: 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại các ô đã nhập.',
  not_found: 'Không tìm thấy dữ liệu. Có thể mục này vừa bị xoá.',
  internal: 'Máy chủ gặp sự cố. Vui lòng thử lại sau.',
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? FALLBACK;
  // fetch() rejects with a TypeError when the request never completed: offline, DNS failure,
  // or a blocked CORS preflight.
  if (error instanceof TypeError) {
    return 'Không kết nối được máy chủ. Kiểm tra mạng hoặc cấu hình CORS_ORIGINS của API.';
  }
  return FALLBACK;
}
