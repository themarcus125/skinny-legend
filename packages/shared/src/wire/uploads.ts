import { z } from 'zod';

export const UPLOAD_KINDS = ['photo', 'avatar', 'feedback'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

export const presignBody = z.object({
  kind: z.enum(UPLOAD_KINDS),
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
});
export type PresignInput = z.infer<typeof presignBody>;

export interface PresignResponse {
  key: string;
  url: string;
  expiresAt: string;
}
