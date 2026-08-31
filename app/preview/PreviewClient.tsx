'use client';

import { useEffect, useState } from 'react';
import WorkspaceClient, { type SessionUser } from '../WorkspaceClient';
import {
  WEEKS_IN_YEAR,
  seedTeams,
  taskKey,
  weekLabel,
  type Person,
  type Team,
} from '../org-data';
import {
  baseAcademicYear,
  compareAcademicYears,
  type AlignmentItem,
} from '../academic-calendar';
import type {
  HandoverCategory,
  HandoverDocument,
  HandoverEntry,
  WorkBundle,
} from '../handover-schema';
import type { ScheduleChange } from '../workspace/types';

type PreviewMember = Person & { teamId: string };
type ChecklistKey = 'result-report' | 'schedule-share' | 'contact-refresh';
type ChecklistItem = {
  key: ChecklistKey;
  completed: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

const CHECKLIST_KEYS: ChecklistKey[] = ['result-report', 'schedule-share', 'contact-refresh'];
const PALETTES = [
  { color: '#a0475c', soft: '#f8eaee' },
  { color: '#4d7a33', soft: '#edf4e7' },
  { color: '#7a5230', soft: '#f3ece6' },
  { color: '#4a5a8c', soft: '#eaedf7' },
];

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) return new URL(input.url);
  return new URL(String(input), window.location.origin);
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === 'string') return JSON.parse(init.body) as Record<string, unknown>;
  if (input instanceof Request) return await input.clone().json() as Record<string, unknown>;
  return {};
}

function seedPerson(personId: string) {
  for (const team of seedTeams) {
    const person = team.people.find((candidate) => candidate.id === personId);
    if (person) return { person, team };
  }
  return null;
}

function createPreviewFetch(user: SessionUser, fallback: typeof window.fetch) {
  const removedMemberIds: string[] = [];
  const customTeams: Team[] = [];
  const customMembers: PreviewMember[] = [];
  const scheduleChanges: ScheduleChange[] = [];
  const checklists = new Map<string, ChecklistItem[]>();
  let handoverDocument: HandoverDocument | null = null;

  const checklistFor = (personId: string, taskTitle: string) => {
    const key = taskKey(personId, taskTitle);
    const existing = checklists.get(key);
    if (existing) return existing;
    const items = CHECKLIST_KEYS.map((itemKey) => ({
      key: itemKey,
      completed: false,
      updatedBy: null,
      updatedAt: null,
    }));
    checklists.set(key, items);
    return items;
  };

  const previewFetch: typeof window.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return fallback(input, init);
    }

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const body = method === 'GET' || method === 'HEAD' ? {} : await requestBody(input, init);

    if (url.pathname === '/api/auth/logout') return json({ ok: true });

    if (url.pathname === '/api/members' && method === 'GET') {
      return json({ removedMemberIds, customMembers });
    }
    if (url.pathname === '/api/members' && method === 'PUT') {
      const teamId = String(body.teamId ?? '').trim();
      const name = String(body.name ?? '').trim();
      const role = String(body.role ?? '').trim();
      if (!teamId || !name || !role) return json({ error: '소속 파트, 이름과 담당 업무를 모두 입력해 주세요.' }, 400);
      const member: PreviewMember = {
        id: `preview-person-${crypto.randomUUID()}`,
        teamId,
        name,
        role,
        initial: Array.from(name)[0] ?? '?',
        tasks: [],
      };
      customMembers.push(member);
      return json({ member }, 201);
    }
    if (url.pathname === '/api/members' && (method === 'POST' || method === 'DELETE')) {
      const personId = String(body.personId ?? '');
      if (method === 'POST' && !removedMemberIds.includes(personId)) removedMemberIds.unshift(personId);
      if (method === 'DELETE') {
        const index = removedMemberIds.indexOf(personId);
        if (index >= 0) removedMemberIds.splice(index, 1);
      }
      return json({ ok: true });
    }

    if (url.pathname === '/api/teams' && method === 'GET') return json({ customTeams });
    if (url.pathname === '/api/teams' && method === 'POST') {
      const title = String(body.title ?? '').trim();
      if (!title) return json({ error: '파트명을 입력해 주세요.' }, 400);
      const palette = PALETTES[customTeams.length % PALETTES.length];
      const team: Team = {
        id: `preview-team-${crypto.randomUUID()}`,
        title,
        short: title,
        english: String(body.english ?? '').trim(),
        description: String(body.description ?? '').trim() || `${title} 파트의 주요 업무와 연간 일정을 관리합니다.`,
        color: palette.color,
        soft: palette.soft,
        mark: String(seedTeams.length + customTeams.length + 1).padStart(2, '0'),
        people: [],
      };
      customTeams.push(team);
      return json({ team }, 201);
    }

    if (url.pathname === '/api/schedules' && method === 'GET') return json({ changes: scheduleChanges });
    if (url.pathname === '/api/schedules' && method === 'POST') {
      const personId = String(body.personId ?? '');
      const taskTitle = String(body.taskTitle ?? '');
      const toStart = Number(body.toStart);
      const reason = String(body.reason ?? '').trim();
      const found = seedPerson(personId)?.person.tasks.find((task) => task.title === taskTitle);
      if (!found || !Number.isInteger(toStart) || !reason) return json({ error: '유효한 일정과 변경 사유가 필요합니다.' }, 400);
      const key = taskKey(personId, taskTitle);
      const previous = [...scheduleChanges].reverse().find((change) => change.taskKey === key);
      const change: ScheduleChange = {
        taskKey: key,
        personId,
        taskTitle,
        fromStart: previous?.toStart ?? found.start,
        toStart,
        reason,
        changedBy: user.displayName,
        changedAt: new Date().toISOString(),
      };
      scheduleChanges.push(change);
      return json({ change });
    }

    if (url.pathname === '/api/task-checklists' && method === 'GET') {
      return json({ items: checklistFor(url.searchParams.get('personId') ?? '', url.searchParams.get('taskTitle') ?? '') });
    }
    if (url.pathname === '/api/task-checklists' && method === 'POST') {
      const personId = String(body.personId ?? '');
      const taskTitle = String(body.taskTitle ?? '');
      const itemKey = String(body.itemKey ?? '') as ChecklistKey;
      const items = checklistFor(personId, taskTitle);
      const item = items.find((candidate) => candidate.key === itemKey);
      if (!item || typeof body.completed !== 'boolean') return json({ error: '유효한 체크 항목이 필요합니다.' }, 400);
      item.completed = body.completed;
      item.updatedBy = user.displayName;
      item.updatedAt = new Date().toISOString();
      return json({ item });
    }

    if (url.pathname === '/api/calendar-check' && method === 'POST') {
      const found = seedPerson(String(body.personId ?? ''));
      const toYear = Number(body.year) || baseAcademicYear + 1;
      if (!found) return json({ error: '담당자를 찾지 못했습니다.' }, 400);
      const shifts = compareAcademicYears(baseAcademicYear, toYear);
      const moved = shifts.filter((shift) => shift.shift !== 0);
      const items: AlignmentItem[] = found.person.tasks.map((task, index) => {
        const anchor = moved[index % Math.max(moved.length, 1)];
        const latest = [...scheduleChanges].reverse().find((change) => change.taskKey === taskKey(found.person.id, task.title));
        const currentStart = latest?.toStart ?? task.start;
        const proposed = anchor
          ? Math.max(0, Math.min(WEEKS_IN_YEAR - task.duration, currentStart + anchor.shift))
          : currentStart;
        return {
          id: `preview-alignment-${index}`,
          taskTitle: task.title,
          action: proposed === currentStart ? 'keep' : 'shift',
          currentStart,
          suggestedStart: proposed,
          currentLabel: weekLabel(currentStart),
          suggestedLabel: weekLabel(proposed),
          anchorEvent: anchor?.name ?? '',
          anchorLabel: anchor?.toLabel ?? '',
          anchorShift: anchor?.shift ?? 0,
          reason: anchor ? `${anchor.name} 일정 변동을 반영한 제안입니다.` : '변경할 학사일정 근거가 없어 현재 일정을 유지합니다.',
          note: '',
        };
      });
      return json({
        person: { id: found.person.id, name: found.person.name, role: found.person.role, team: found.team.title },
        fromYear: baseAcademicYear,
        toYear,
        shifts,
        items,
        notice: '미리보기에서는 공개된 학사일정 차이를 기준으로 결과를 재현합니다.',
      });
    }

    if (url.pathname === '/api/draft' && method === 'POST') {
      const found = seedPerson(String(body.personId ?? ''));
      if (!found) return json({ error: '담당자를 찾지 못했습니다.' }, 400);
      const drafts = found.person.tasks.slice(0, 3).map((task, index) => ({
        id: `preview-draft-${index}`,
        category: (index === 0 ? 'responsibility' : 'plan') as HandoverCategory,
        title: task.title,
        detail: `<p>${escapeHtml(task.note)}</p><p><strong>업무 기간</strong> ${escapeHtml(weekLabel(task.start))}부터 ${task.duration}주간</p>`,
        properties: index === 0 ? { cycle: '연 1회', importance: '중요' } : { progress: '준비 전' },
        basis: 'record' as const,
        questions: [],
        sourceTask: task.title,
      }));
      return json({
        person: { id: found.person.id, name: found.person.name, role: found.person.role, team: found.team.title },
        todayLabel: weekLabel(0),
        drafts,
      });
    }

    if (url.pathname === '/api/import' && method === 'POST') {
      const source = String(body.source ?? '').trim();
      const fileName = String(body.fileName ?? '붙여넣은 내용');
      if (source.length < 30) return json({ error: '분류할 원문이 너무 짧습니다.' }, 400);
      const excerpt = source.replace(/\s+/g, ' ').slice(0, 180);
      return json({
        fileName,
        charCount: source.length,
        items: [{
          id: 'preview-import-1',
          category: 'responsibility',
          title: excerpt.slice(0, 42) || '기존 자료에서 가져온 담당업무',
          detail: `<p>${escapeHtml(excerpt)}</p>`,
          properties: { importance: '중요' },
          questions: [],
          sourceQuote: excerpt.slice(0, 80),
          confidence: 'high',
        }],
        unmapped: [],
      });
    }

    if (url.pathname === '/api/annual' && method === 'POST') {
      const entries = Array.isArray(body.entries) ? body.entries as Array<Record<string, unknown>> : [];
      const fromYear = Number(body.year) || new Date().getFullYear();
      return json({
        fromYear,
        toYear: fromYear + 1,
        reviewed: entries.length,
        items: entries.map((entry, index) => ({
          id: `preview-annual-${index}`,
          action: index === 0 ? 'revise' : 'keep',
          entryId: String(entry.id ?? ''),
          previousTitle: String(entry.title ?? ''),
          category: entry.category,
          title: String(entry.title ?? ''),
          detail: `<p>${escapeHtml(String(entry.text ?? ''))}</p>`,
          properties: entry.properties ?? {},
          reason: index === 0 ? '다음 학년도 시작 전에 일정과 담당 정보를 다시 확인해 주세요.' : '해마다 달라지는 정보가 없어 유지할 수 있습니다.',
          questions: index === 0 ? ['새 학년도의 정확한 일정과 담당자가 확정되었나요?'] : [],
        })),
      });
    }

    if (url.pathname === '/api/quality' && method === 'POST') {
      const entries = Array.isArray(body.entries) ? body.entries : [];
      return json({ checked: entries.length, findings: [] });
    }

    if (url.pathname === '/api/handover' && method === 'GET') {
      const pendingDocuments = handoverDocument?.status === 'pending'
        ? [{ ownerEmail: user.email, ownerName: user.displayName, status: handoverDocument.status, updatedAt: handoverDocument.updatedAt }]
        : [];
      return json({ document: handoverDocument, viewerRole: 'admin', pendingDocuments });
    }
    if (url.pathname === '/api/handover' && method === 'PUT') {
      const entries = (Array.isArray(body.entries) ? body.entries : []) as HandoverEntry[];
      const bundles = (Array.isArray(body.bundles) ? body.bundles : []) as Array<Partial<WorkBundle> & Pick<WorkBundle, 'id' | 'title' | 'entryIds'>>;
      const now = new Date().toISOString();
      handoverDocument = {
        ownerName: user.displayName,
        status: handoverDocument?.status === 'rejected' ? 'rejected' : 'draft',
        entries,
        bundles: bundles.map((bundle) => ({ ...bundle, decision: null, comment: '' })),
        updatedAt: now,
        submittedAt: handoverDocument?.submittedAt ?? null,
        reviewedAt: null,
        reviewedBy: null,
      };
      return json({ document: handoverDocument });
    }
    if (url.pathname === '/api/handover' && method === 'POST') {
      if (!handoverDocument) return json({ error: '먼저 인수인계 항목을 저장해 주세요.' }, 404);
      const action = String(body.action ?? '');
      const now = new Date().toISOString();
      if (action === 'submit') {
        handoverDocument = { ...handoverDocument, status: 'pending', submittedAt: now, updatedAt: now };
      } else if (action === 'rollover') {
        handoverDocument = {
          ...handoverDocument,
          status: 'draft',
          submittedAt: null,
          reviewedAt: null,
          reviewedBy: null,
          updatedAt: now,
          bundles: handoverDocument.bundles.map((bundle) => ({ ...bundle, decision: null, comment: '' })),
        };
      } else if (action === 'review') {
        const decisions = Array.isArray(body.decisions) ? body.decisions as Array<Record<string, unknown>> : [];
        const rejected = decisions.some((decision) => decision.decision === 'rejected');
        handoverDocument = {
          ...handoverDocument,
          status: rejected ? 'rejected' : 'approved',
          reviewedAt: now,
          reviewedBy: user.displayName,
          updatedAt: now,
          bundles: handoverDocument.bundles.map((bundle) => {
            const decision = decisions.find((candidate) => candidate.bundleId === bundle.id);
            return decision ? { ...bundle, decision: decision.decision as WorkBundle['decision'], comment: String(decision.comment ?? '') } : bundle;
          }),
        };
      } else {
        return json({ error: '지원하지 않는 작업입니다.' }, 400);
      }
      return json({ document: handoverDocument });
    }

    return json({ error: '미리보기에서 지원하지 않는 요청입니다.' }, 404);
  };

  return previewFetch;
}

/**
 * Mounts the real workspace against an in-memory API.
 *
 * The preview used to render the UI while deliberately letting every request fail with 401. That
 * made visual screenshots deterministic, but it also made almost every interactive control look
 * broken. Waiting one effect before mounting the workspace ensures even its first data request is
 * intercepted; production pages continue to use the real Spring API unchanged.
 */
export default function PreviewClient({ currentUser }: { currentUser: SessionUser }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = createPreviewFetch(currentUser, originalFetch);
    queueMicrotask(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      window.fetch = originalFetch;
    };
  }, [currentUser]);

  if (!ready) return <main aria-busy="true" aria-label="미리보기 준비 중" />;
  return <WorkspaceClient currentUser={currentUser} />;
}
