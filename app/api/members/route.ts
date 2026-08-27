import { env } from 'cloudflare:workers';
import { createRemovedMembersTable } from '../../../db/schema';
import { getAppRole } from '../../authz';
import { getChatGPTUser } from '../../chatgpt-auth';

type AppEnv = Cloudflare.Env & { DB: D1Database };
const validMemberIds = new Set(['minseo', 'jiwoo', 'dohyun', 'seoyeon', 'junho', 'eunchae', 'yujin', 'taeyang', 'sujin', 'hyejin', 'seongmin', 'nayeon']);

function database() {
  return (env as AppEnv).DB;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(createRemovedMembersTable).run();
}

async function authorizedRole() {
  const user = await getChatGPTUser();
  return user ? getAppRole(user) : null;
}

export async function GET() {
  if (!await authorizedRole()) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const db = database();
  await ensureSchema(db);
  const result = await db.prepare('SELECT person_id FROM removed_members ORDER BY removed_at DESC').all<{ person_id: string }>();
  return Response.json({ removedMemberIds: result.results.map((row) => row.person_id) });
}

export async function POST(request: Request) {
  if (await authorizedRole() !== 'admin') return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
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
  if (await authorizedRole() !== 'admin') return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  const { personId } = await request.json<{ personId?: string }>();
  if (!personId || !validMemberIds.has(personId)) return Response.json({ error: '유효한 팀원 정보가 필요합니다.' }, { status: 400 });

  const db = database();
  await ensureSchema(db);
  await db.prepare('DELETE FROM removed_members WHERE person_id = ?').bind(personId).run();
  return Response.json({ ok: true });
}
