import { env } from 'cloudflare:workers';
import { createTaskReschedulesTable } from '../../../db/schema';
import { findPerson, taskPeriodLabel, taskPhase, weekLabel, locateToday, type Task } from '../../org-data';
import { handoverCategories, handoverCategoryLabels, type DraftItem, type HandoverCategory } from '../../handover-schema';
import { allowedProperties, askModel, cleanProperties, detailHtml } from '../../ai-shared';
import { getAppRole } from '../../authz';
import { getChatGPTUser } from '../../chatgpt-auth';

type AppEnv = Cloudflare.Env & { DB: D1Database; OPENAI_API_KEY?: string };
type MoveRow = { task_title: string; from_start: number; to_start: number; reason: string; changed_at: string };

const MAX_DRAFTS = 8;
const MAX_QUESTIONS = 3;
const TITLE_MAX = 80;

/** What the model is allowed to say about one task. Assembled from records only. */
type TaskFacts = {
  업무: string;
  설명: string;
  기간: string;
  진행상태: '완료' | '진행 중' | '예정';
  경과?: string;
  /** set when the task is still running today, so its tail lands on the successor */
  인계시점이후종료?: true;
  일정변경?: { 변경전: string; 변경후: string; 사유: string }[];
};

function database() {
  return (env as AppEnv).DB;
}

async function authorizedUser() {
  const user = await getChatGPTUser();
  if (!user || !getAppRole(user)) return null;
  return user;
}

/** Latest recorded move wins, exactly like the calendar view resolves a task's real start. */
function effectiveTasks(tasks: Task[], moves: MoveRow[]) {
  return tasks.map((task) => {
    const trail = moves.filter((move) => move.task_title === task.title);
    const current = trail[trail.length - 1]?.to_start;
    return { task: current === undefined ? task : { ...task, start: current, movedFrom: task.start }, trail };
  }).sort((first, second) => first.task.start - second.task.start);
}

function buildFacts(tasks: Task[], moves: MoveRow[], todayWeek: number): TaskFacts[] {
  return effectiveTasks(tasks, moves).map(({ task, trail }) => {
    const phase = taskPhase(task, todayWeek);
    const facts: TaskFacts = {
      업무: task.title,
      설명: task.note,
      기간: taskPeriodLabel(task),
      진행상태: phase === 'done' ? '완료' : phase === 'active' ? '진행 중' : '예정',
    };
    if (phase === 'active') {
      facts.경과 = `${task.duration}주 중 ${todayWeek - task.start + 1}주차`;
      facts.인계시점이후종료 = true;
    }
    if (trail.length) {
      facts.일정변경 = trail.map((move) => ({
        변경전: weekLabel(move.from_start),
        변경후: weekLabel(move.to_start),
        사유: move.reason,
      }));
    }
    return facts;
  });
}

const systemPrompt = `너는 한국 대학 국제처의 업무 인수인계서 작성을 돕는다.

절대 규칙:
1. 입력 데이터에 있는 사실만 사용한다.
2. 인원수, 금액, 진행 건수, 사람 이름, 기관명, 연락처, 구체적 날짜를 새로 지어내지 않는다. 데이터에 없으면 쓰지 않는다.
3. 데이터에 없지만 후임자에게 꼭 필요한 정보는 questions 배열에 질문으로 남긴다. 본문에 추측해서 쓰지 않는다.
4. 문장은 공문서체 존댓말로 간결하게 쓴다. 마크다운이나 HTML 태그를 쓰지 않는다.

섹션 배정:
- responsibility(담당업무): 담당자의 역할과 연간 업무 범위. 정확히 1건만.
- plan(주요업무계획 및 진행사항): 진행상태가 '진행 중' 또는 '예정'인 업무마다 1건.
- issue(현안사항 및 문제점): 일정변경 이력이 있는 업무만. 변경 사유를 그대로 인용해 문제 상황을 설명한다. 이력이 없으면 만들지 않는다.
- pending(주요미결사항): 인계시점이후종료가 true인 업무마다 반드시 1건 만든다. 해당 업무가 없으면 만들지 않는다.

basis 판정:
- record: 모든 문장이 입력 데이터의 업무명, 기간, 일정변경 사유에서 직접 나온 경우.
- inferred: 날짜 계산으로 유추한 경우(예: 인계 시점 이후까지 이어질 것이라는 판단).

questions 규칙:
- 후임자가 반드시 알아야 하지만 입력 데이터에 없는 정보를 묻는다. 진행 건수, 대상 인원, 담당 주무관, 확정 날짜, 미결 사유 같은 것이다.
- plan, issue, pending 항목에는 최소 1개를 반드시 넣는다. responsibility 항목은 0~2개.
- 데이터에 이미 있는 내용을 되묻지 않는다.

properties 규칙:
- 허용속성에 나열된 key만 쓴다. 나열되지 않은 key는 작성자가 직접 채울 항목이므로 절대 만들어내지 않는다.
- 일정변경 사유와 남은 기간으로 판단할 수 있을 때만 채우고, 애매하면 비운다.

문장 규칙:
- 입력 데이터의 key 이름(변경전, 변경후, 진행상태, 경과 등)을 문장에 그대로 쓰지 않는다. 자연스러운 우리말로 바꿔 쓴다.
- title은 업무 내용을 나타내는 제목으로 짓는다. sourceTask 값이나 섹션 이름을 그대로 제목으로 쓰지 않는다.

sourceTask에는 근거가 된 업무명을 적는다. 담당업무 항목은 "연간 업무 전체"로 적는다.`;

const responseSchema = {
  type: 'object',
  properties: {
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: handoverCategories },
          title: { type: 'string', description: '문서 제목. 40자 이내.' },
          paragraphs: { type: 'array', items: { type: 'string' }, description: '본문 문단. 1~3개.' },
          properties: {
            type: 'array',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, value: { type: 'string' } },
              required: ['key', 'value'],
              additionalProperties: false,
            },
          },
          basis: { type: 'string', enum: ['record', 'inferred'] },
          questions: { type: 'array', items: { type: 'string' }, description: '작성자만 답할 수 있는 질문. 최대 3개.' },
          sourceTask: { type: 'string' },
        },
        required: ['category', 'title', 'paragraphs', 'properties', 'basis', 'questions', 'sourceTask'],
        additionalProperties: false,
      },
    },
  },
  required: ['drafts'],
  additionalProperties: false,
};

/**
 * The calendar can defend a judgement (how urgent, how far along a response is) but never a fact
 * like a due date, a progress figure, or a partner department. Those stay empty for the author.
 */
const inferableKeys = new Set(['importance', 'impact', 'response', 'priority']);

export async function POST(request: Request) {
  const user = await authorizedUser();
  if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const apiKey = (env as AppEnv).OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: 'AI 초안 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.' }, { status: 503 });

  const { personId } = await request.json<{ personId?: string }>();
  const found = personId ? findPerson(personId) : null;
  if (!found) return Response.json({ error: '담당자를 찾을 수 없습니다.' }, { status: 400 });

  const today = locateToday(new Date());
  if (today.week === null) return Response.json({ error: '2026학년도 기간에만 초안을 만들 수 있습니다.' }, { status: 400 });

  const db = database();
  await db.prepare(createTaskReschedulesTable).run();
  const moves = await db
    .prepare('SELECT task_title, from_start, to_start, reason, changed_at FROM task_reschedules WHERE person_id = ? ORDER BY id ASC')
    .bind(personId)
    .all<MoveRow>();

  const facts = buildFacts(found.person.tasks, moves.results, today.week);
  const payload = {
    담당자: { 이름: found.person.name, 역할: found.person.role, 소속팀: found.team.title },
    오늘: weekLabel(today.week),
    허용속성: allowedProperties((key) => inferableKeys.has(key)),
    업무목록: facts,
  };

  const result = await askModel<{ drafts: { category: string; title: string; paragraphs: string[]; properties: { key: string; value: string }[]; basis: string; questions: string[]; sourceTask: string }[] }>({
    apiKey,
    label: 'draft',
    schemaName: 'handover_draft',
    schema: responseSchema,
    system: systemPrompt,
    user: JSON.stringify(payload, null, 1),
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  const drafts: DraftItem[] = result.data.drafts
    .filter((item) => handoverCategories.includes(item.category as HandoverCategory) && item.title?.trim() && item.paragraphs?.length)
    .slice(0, MAX_DRAFTS)
    .map((item, index) => {
      const category = item.category as HandoverCategory;
      const questions = (item.questions ?? []).map((line) => line.trim()).filter(Boolean).slice(0, MAX_QUESTIONS);
      const paragraphs = item.paragraphs.map((line) => line.trim()).filter(Boolean);
      return {
        id: `draft-${index}`,
        category,
        title: item.title.trim().slice(0, TITLE_MAX),
        detail: detailHtml(paragraphs, questions),
        properties: cleanProperties(category, item.properties ?? [], (key) => inferableKeys.has(key)),
        basis: item.basis === 'record' ? 'record' : 'inferred',
        questions,
        sourceTask: (item.sourceTask ?? '').trim() || handoverCategoryLabels[category],
      };
    });

  return Response.json({
    person: { id: found.person.id, name: found.person.name, role: found.person.role, team: found.team.title },
    todayLabel: weekLabel(today.week),
    drafts,
  });
}
