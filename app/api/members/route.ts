import { env } from 'cloudflare:workers';
import { createRemovedMembersTable } from '../../../db/schema';

type AppEnv = Cloudflare.Env & { DB: D1Database };
const validMemberIds = new Set(['minseo', 'jiwoo', 'dohyun', 'seoyeon', 'junho', 'eunchae', 'yujin', 'taeyang', 'sujin', 'hyejin', 'seongmin', 'nayeon']);

function database() {
  return (env as AppEnv).DB;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(createRemovedMembersTable).run();
}

export async function GET() {
  const db = database();
  await ensureSchema(db);
  const result = await db.prepare('SELECT person_id FROM removed_members ORDER BY removed_at DESC').all<{ person_id: string }>();
  return Response.json({ removedMemberIds: result.results.map((row) => row.person_id) });
}

export async function POST(request: Request) {
  const { personId } = await request.json<{ personId?: string }>();
  if (!personId || !validMemberIds.has(personId)) return Response.json({ error: '유효한 팀원 정보가 필요합니다.' }, { status: 400 });

  const db = database();
  await ensureSchema(db);
  await db.prepare('INSERT OR REPLACE INTO removed_members (person_id, removed_at) VALUES (?, ?)')
    .bind(personId, new Date().toISOString())
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { personId } = await request.json<{ personId?: string }>();
  if (!personId || !validMemberIds.has(personId)) return Response.json({ error: '유효한 팀원 정보가 필요합니다.' }, { status: 400 });

  const db = database();
  await ensureSchema(db);
  await db.prepare('DELETE FROM removed_members WHERE person_id = ?').bind(personId).run();
  return Response.json({ ok: true });
}
