import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { classifyPhoto } from '../src/services/vision.js';
import { makeThumbnail } from '../src/services/thumbnail.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function fakeFetch(content: string, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as unknown as typeof fetch;
}

describe('classifyPhoto', () => {
  it('parses a well-formed JSON verdict', async () => {
    const v = await classifyPhoto(png, { fetch: fakeFetch('{"categories":["exercise","group"],"healthy":null,"confidence":0.9,"reason":"Phòng gym."}'), model: 'test/model' });
    expect(v).toMatchObject({ categories: ['exercise', 'group'], healthy: null, confidence: 0.9, reason: 'Phòng gym.', model: 'test/model', failed: false });
  });

  it('strips markdown fences around JSON', async () => {
    const v = await classifyPhoto(png, { fetch: fakeFetch('```json\n{"categories":["meal"],"healthy":true,"confidence":0.7,"reason":"Salad."}\n```') });
    expect(v.categories).toEqual(['meal']);
    expect(v.healthy).toBe(true);
  });

  it('drops unknown categories and clamps confidence', async () => {
    const v = await classifyPhoto(png, { fetch: fakeFetch('{"categories":["exercise","sleep"],"healthy":null,"confidence":7,"reason":"x"}') });
    expect(v.categories).toEqual(['exercise']);
    expect(v.confidence).toBe(1);
  });

  it('returns failed verdict on malformed JSON', async () => {
    const v = await classifyPhoto(png, { fetch: fakeFetch('not json') });
    expect(v.failed).toBe(true);
    expect(v.categories).toEqual([]);
  });

  it('returns failed verdict on HTTP error', async () => {
    const v = await classifyPhoto(png, { fetch: fakeFetch('', 500) });
    expect(v.failed).toBe(true);
  });

  it('returns failed verdict on timeout', async () => {
    const slow = (async (_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    const v = await classifyPhoto(png, { fetch: slow, timeoutMs: 20 });
    expect(v.failed).toBe(true);
  });
});

describe('makeThumbnail', () => {
  it('resizes to a 400px-wide JPEG preserving aspect ratio', async () => {
    const input = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const out = await makeThumbnail(input);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });
});
