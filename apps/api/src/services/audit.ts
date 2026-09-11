import { schema } from '@skinny/shared';
import { db } from '../db.js';

export async function writeAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  diff?: unknown,
  executor: Pick<typeof db, 'insert'> = db,
) {
  await executor.insert(schema.auditLog).values({ actorId, action, targetType, targetId, diffJson: diff ?? null });
}
