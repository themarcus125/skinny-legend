import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  if (err instanceof HTTPException) return c.json({ error: { code: 'http_error', message: err.message } }, err.status);
  console.error(err);
  return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
}
