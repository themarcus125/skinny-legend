import { z } from 'zod';
import { CATEGORIES, type Category } from '@skinny/shared';
import { env } from '../env.js';

export interface Verdict {
  categories: Category[];
  healthy: boolean | null;
  confidence: number;
  reason: string;
  model: string;
  latencyMs: number;
  raw: string;
  failed: boolean;
}

const SYSTEM_PROMPT = `Bạn là trọng tài cho thử thách "Operation Skinny Legend". Nhìn ảnh và xác định hạng mục nào áp dụng:
- "exercise": bất kỳ hoạt động thể thao/tập luyện (đi bộ, chạy, gym, yoga, pickleball, ảnh Strava/Apple Watch tổng kết buổi tập...).
- "meal": bữa ăn hoặc đồ ăn/uống. Chỉ khi có "meal", đặt "healthy" = true nếu bữa ăn lành mạnh (rau, protein nạc, ít dầu mỡ/đường), ngược lại false.
- "group": có ít nhất 2 người cùng tập, hoặc ảnh cuộc gọi video khi tập.
Một ảnh có thể thuộc nhiều hạng mục. Nếu không thuộc hạng mục nào, trả về mảng rỗng.
Trả lời CHỈ bằng JSON đúng định dạng: {"categories":[...],"healthy":true|false|null,"confidence":0-1,"reason":"một câu tiếng Việt"}`;

const verdictSchema = z.object({
  categories: z.array(z.string()),
  healthy: z.boolean().nullish().transform((v) => v ?? null),
  confidence: z.number().default(0.5),
  reason: z.string().default(''),
});

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export async function classifyPhoto(image: Buffer, deps: { fetch?: typeof fetch; model?: string; timeoutMs?: number } = {}): Promise<Verdict> {
  const f = deps.fetch ?? fetch;
  const model = deps.model ?? env.VISION_MODEL;
  const timeoutMs = deps.timeoutMs ?? 8000;
  const started = Date.now();
  const fail = (raw: string): Verdict => ({ categories: [], healthy: null, confidence: 0, reason: '', model, latencyMs: Date.now() - started, raw, failed: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let raw = '';
  try {
    const res = await f('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}` } }] },
        ],
      }),
    });
    if (!res.ok) return fail(`http ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    raw = json.choices?.[0]?.message?.content ?? '';
    const parsed = verdictSchema.safeParse(JSON.parse(extractJson(raw)));
    if (!parsed.success) return fail(raw);
    const categories = [...new Set(parsed.data.categories.filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c)))];
    return {
      categories,
      healthy: categories.includes('meal') ? parsed.data.healthy : null,
      confidence: Math.min(1, Math.max(0, parsed.data.confidence)),
      reason: parsed.data.reason,
      model,
      latencyMs: Date.now() - started,
      raw,
      failed: false,
    };
  } catch {
    return fail(raw);
  } finally {
    clearTimeout(timer);
  }
}
