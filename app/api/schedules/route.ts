import { env } from 'cloudflare:workers';
import { createTaskReschedulesIndex, createTaskReschedulesTable } from '../../../db/schema';
import { WEEKS_IN_YEAR, findSeedTask, taskKey } from '../../org-data';
import { getAppRole } from '../../authz';
import { getChatGPTUser } from '../../chatgpt-auth';

type AppEnv = Cloudflare.Env & { DB: D1Database };
type RescheduleRow = { task_key: string; person_id: string; task_title: string; from_start: number; to_start: number; reason: string; changed_by: string; changed_at: string };

const REASON_MAX = 300;

function database() {
  return (env as AppEnv).DB;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(createTaskReschedulesTable).run();
  await db.prepare(createTaskReschedulesIndex).run();
}

async function authorizedUser() {
  const user = await getChatGPTUser();
  if (!user || !getAppRole(user)) return null;
  return user;
}

export async function GET() {
  if (!await authorizedUser()) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const db = database();
  await ensureSchema(db);
  const result = await db
    .prepare('SELECT task_key, person_id, task_title, from_start, to_start, reason, changed_by, changed_at FROM task_reschedules ORDER BY id ASC')
    .all<RescheduleRow>();
  return Response.json({
    changes: result.results.map((row) => ({
      taskKey: row.task_key,
      personId: row.person_id,
      taskTitle: row.task_title,
      fromStart: row.from_start,
      toStart: row.to_start,
      reason: row.reason,
      changedBy: row.changed_by,
      changedAt: row.changed_at,
    })),
  });
}

export async function POST(request: Request) {
  const user = await authorizedUser();
  if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { personId, taskTitle, toStart, reason } = await request.json<{ personId?: string; taskTitle?: string; toStart?: number; reason?: string }>();
  if (!personId || !taskTitle) return Response.json({ error: '유효한 업무 정보가 필요합니다.' }, { status: 400 });

  const seedTask = findSeedTask(personId, taskTitle);
  if (!seedTask) return Response.json({ error: '존재하지 않는 업무입니다.' }, { status: 400 });

  if (!Number.isInteger(toStart) || toStart! < 0 || toStart! + seedTask.duration > WEEKS_IN_YEAR) {
    return Response.json({ error: '변경할 일정이 2026학년도 안에 있어야 합니다.' }, { status: 400 });
  }

  const trimmedReason = (reason ?? '').trim();
  if (trimmedReason.length < 2) return Response.json({ error: '일정 변경 사유를 입력해 주세요.' }, { status: 400 });
  if (trimmedReason.length > REASON_MAX) return Response.json({ error: `변경 사유는 ${REASON_MAX}자 이내로 입력해 주세요.` }, { status: 400 });

  const db = database();
  await ensureSchema(db);
  const key = taskKey(personId, taskTitle);
  const latest = await db.prepare('SELECT to_start FROM task_reschedules WHERE task_key = ? ORDER BY id DESC LIMIT 1')
    .bind(key)
    .first<{ to_start: number }>();
  const fromStart = latest?.to_start ?? seedTask.start;
  if (fromStart === toStart) return Response.json({ error: '현재와 동일한 일정입니다.' }, { status: 400 });

  const changedAt = new Date().toISOString();
  await db.prepare('INSERT INTO task_reschedules (task_key, person_id, task_title, from_start, to_start, reason, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(key, personId, taskTitle, fromStart, toStart!, trimmedReason, user.displayName, changedAt)
    .run();

  return Response.json({ change: { taskKey: key, personId, taskTitle, fromStart, toStart, reason: trimmedReason, changedBy: user.displayName, changedAt } });
}
