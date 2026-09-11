import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { describeError } from './describe-error';

describe('describeError', () => {
  it('translates every code the dashboard can receive', () => {
    expect(describeError(new ApiError(401, 'unauthenticated', 'Missing token'))).toBe(
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    );
    expect(describeError(new ApiError(403, 'forbidden', 'Admin only'))).toBe(
      'Tài khoản này không có quyền quản trị.',
    );
    expect(describeError(new ApiError(403, 'disabled', 'Account disabled'))).toBe(
      'Tài khoản này đã bị khoá.',
    );
    expect(describeError(new ApiError(400, 'invalid_body', 'Invalid input'))).toBe(
      'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại các ô đã nhập.',
    );
    expect(describeError(new ApiError(404, 'not_found', 'Entry not found'))).toBe(
      'Không tìm thấy dữ liệu. Có thể mục này vừa bị xoá.',
    );
    expect(describeError(new ApiError(500, 'internal', 'Internal error'))).toBe(
      'Máy chủ gặp sự cố. Vui lòng thử lại sau.',
    );
  });

  it('describes a network / CORS failure', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng hoặc cấu hình CORS_ORIGINS của API.',
    );
  });

  it('never leaks the English server message for an unknown code', () => {
    const message = describeError(new ApiError(418, 'teapot', 'I am a teapot'));
    expect(message).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
    expect(message).not.toContain('teapot');
  });

  it('falls back for anything that is not an Error', () => {
    expect(describeError(null)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
    expect(describeError('boom')).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
