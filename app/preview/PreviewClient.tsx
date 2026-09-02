'use client';

import { useEffect, useState } from 'react';
import WorkspaceClient, { type SessionUser } from '../WorkspaceClient';
import {
  WEEKS_IN_YEAR,
  academicYearBounds,
  seedTeams,
  taskKey,
  taskSpan,
  weekLabel,
  weekOfDate,
  type Person,
  type Task,
  type TaskDate,
  type TaskPeriod,
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
type PreviewTask = Person['tasks'][number] & { personId: string };
type PreviewTaskDate = TaskDate & { taskKey: string };
type PreviewTaskPeriod = TaskPeriod & {
  taskKey: string;
  personId: string;
  taskTitle: string;
  startWeek: number;
  duration: number;
};
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
  const customTasks: PreviewTask[] = [];
  const removedTaskKeys: string[] = [];
  const scheduleChanges: ScheduleChange[] = [];
  const checklists = new Map<string, ChecklistItem[]>();
  const taskDates: PreviewTaskDate[] = [];
  const taskPeriods: PreviewTaskPeriod[] = [];
  let nextTaskDateId = 1;

  /* The slots a fixed period lands on, derived the same way the server derives them so the preview
     places a date-fixed task on the year track where the real workspace would. */
  const describePeriod = (period: Omit<PreviewTaskPeriod, 'startWeek' | 'duration'>): PreviewTaskPeriod => {
    const startWeek = weekOfDate(period.startsOn);
    return { ...period, startWeek, duration: Math.max(1, weekOfDate(period.endsOn) - startWeek + 1) };
  };
  let handoverDocument: HandoverDocument | null = null;

  /* The task as the workspace currently shows it, so a preview date is bounded by the moved span —
     or by the fixed period where there is one — the same way the server bounds a real one. */
  const currentTask = (personId: string, taskTitle: string): Task | null => {
    const key = taskKey(personId, taskTitle);
    const found = customTasks.find((task) => task.personId === personId && task.title === taskTitle)
      ?? (removedTaskKeys.includes(key)
        ? undefined
        : seedPerson(personId)?.person.tasks.find((task) => task.title === taskTitle));
    if (!found) return null;
    const moved = [...scheduleChanges].reverse().find((change) => change.taskKey === key);
    const shown = moved ? { ...found, start: moved.toStart } : found;
    const fixed = taskPeriods.find((period) => period.taskKey === key);
    if (!fixed) return shown;
    return {
      ...shown,
      start: fixed.startWeek,
      duration: fixed.duration,
      period: { startsOn: fixed.startsOn, endsOn: fixed.endsOn, setBy: fixed.setBy },
    };
  };

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
    if (url.pathname === '/api/auth/account' && method === 'DELETE') return json({ ok: true });

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

    if (url.pathname === '/api/tasks' && method === 'GET') return json({ tasks: customTasks, removedTaskKeys });
    if (url.pathname === '/api/tasks' && method === 'DELETE') {
      const personId = String(body.personId ?? '').trim();
      const taskTitle = String(body.taskTitle ?? '').trim();
      const key = taskKey(personId, taskTitle);
      const authored = customTasks.findIndex((task) => task.personId === personId && task.title === taskTitle);
      if (authored >= 0) customTasks.splice(authored, 1);
      else if (seedPerson(personId)?.person.tasks.some((task) => task.title === taskTitle) && !removedTaskKeys.includes(key)) {
        removedTaskKeys.push(key);
      } else return json({ error: '존재하지 않는 업무입니다.' }, 404);
      for (let index = scheduleChanges.length - 1; index >= 0; index -= 1) {
        if (scheduleChanges[index].taskKey === key) scheduleChanges.splice(index, 1);
      }
      checklists.delete(key);
      for (let index = taskDates.length - 1; index >= 0; index -= 1) {
        if (taskDates[index].taskKey === key) taskDates.splice(index, 1);
      }
      const fixed = taskPeriods.findIndex((period) => period.taskKey === key);
      if (fixed >= 0) taskPeriods.splice(fixed, 1);
      return json({ ok: true });
    }
    if (url.pathname === '/api/tasks' && method === 'POST') {
      const requestedIds = Array.isArray(body.personIds)
        ? body.personIds.map((personId) => String(personId ?? '').trim()).filter(Boolean)
        : [String(body.personId ?? '').trim()].filter(Boolean);
      const personIds = [...new Set(requestedIds)];
      const title = String(body.title ?? '').trim();
      let start = Number(body.start);
      let duration = Number(body.duration);
      const note = String(body.note ?? '').trim();
      const fixedStart = String(body.startsOn ?? '').trim();
      const fixedEnd = String(body.endsOn ?? '').trim();
      if (fixedStart || fixedEnd) {
        if (!fixedStart || !fixedEnd) return json({ error: '확정 기간의 시작일과 종료일을 모두 선택해 주세요.' }, 400);
        if (fixedEnd < fixedStart) return json({ error: '종료일이 시작일보다 빠를 수 없습니다.' }, 400);
        if (fixedStart < academicYearBounds.from || fixedEnd > academicYearBounds.to) {
          return json({ error: `확정 기간은 학년도(${academicYearBounds.from} ~ ${academicYearBounds.to}) 안에 있어야 합니다.` }, 400);
        }
        start = weekOfDate(fixedStart);
        duration = Math.max(1, weekOfDate(fixedEnd) - start + 1);
      }
      if (personIds.length === 0 || !title || !Number.isInteger(start) || !Number.isInteger(duration) || start < 0 || duration < 1 || start + duration > WEEKS_IN_YEAR) {
        return json({ error: '담당자, 일정명과 기간을 확인해 주세요.' }, 400);
      }
      for (const personId of personIds) {
        const personExists = Boolean(seedPerson(personId)) || customMembers.some((member) => member.id === personId);
        const duplicate = (seedPerson(personId)?.person.tasks.some((task) => task.title === title)
            && !removedTaskKeys.includes(taskKey(personId, title)))
          || customTasks.some((task) => task.personId === personId && task.title === title);
        if (!personExists) return json({ error: '담당자를 선택해 주세요.' }, 400);
        if (duplicate) return json({ error: '같은 담당자에게 동일한 이름의 일정이 이미 있습니다.' }, 409);
      }
      const tasks = personIds.map((personId): PreviewTask => ({ personId, title, start, duration, note }));
      if (fixedStart && fixedEnd) {
        for (const task of tasks) taskPeriods.push(describePeriod({
          taskKey: taskKey(task.personId, title),
          personId: task.personId,
          taskTitle: title,
          startsOn: fixedStart,
          endsOn: fixedEnd,
          setBy: user.displayName,
        }));
      }
      customTasks.push(...tasks);
      return json(Array.isArray(body.personIds) ? { tasks } : { task: tasks[0] }, 201);
    }

    if (url.pathname === '/api/schedules' && method === 'GET') return json({ changes: scheduleChanges });
    if (url.pathname === '/api/schedules' && method === 'POST') {
      const personId = String(body.personId ?? '');
      const taskTitle = String(body.taskTitle ?? '');
      const toStart = Number(body.toStart);
      const reason = String(body.reason ?? '').trim();
      const found = customTasks.find((task) => task.personId === personId && task.title === taskTitle)
        ?? (removedTaskKeys.includes(taskKey(personId, taskTitle))
          ? undefined
          : seedPerson(personId)?.person.tasks.find((task) => task.title === taskTitle));
      if (!found || !Number.isInteger(toStart) || !reason) return json({ error: '유효한 일정과 변경 사유가 필요합니다.' }, 400);
      const key = taskKey(personId, taskTitle);
      if (taskPeriods.some((period) => period.taskKey === key)) {
        return json({ error: '날짜가 확정된 업무입니다. 확정 기간을 수정하거나 해제한 뒤 변경해 주세요.' }, 400);
      }
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

    if (url.pathname === '/api/task-dates' && method === 'GET') {
      const personId = url.searchParams.get('personId');
      const taskTitle = url.searchParams.get('taskTitle');
      if (personId === null && taskTitle === null) return json({ dates: taskDates });
      const key = taskKey(personId ?? '', taskTitle ?? '');
      return json({ dates: taskDates.filter((date) => date.taskKey === key) });
    }
    if (url.pathname === '/api/task-dates' && method === 'POST') {
      const personId = String(body.personId ?? '').trim();
      const taskTitle = String(body.taskTitle ?? '').trim();
      const batch = Array.isArray(body.dates) ? body.dates as { date?: unknown; label?: unknown }[] : null;
      const entries = (batch?.length ? batch : [{ date: body.date, label: body.label }])
        .map((entry) => ({ date: String(entry.date ?? '').trim(), label: String(entry.label ?? '').trim() }));
      const task = currentTask(personId, taskTitle);
      if (!task) return json({ error: '존재하지 않는 업무입니다.' }, 400);
      const range = taskSpan(task);
      const key = taskKey(personId, taskTitle);
      const seen = new Set<string>();
      for (const entry of entries) {
        if (!entry.date) return json({ error: '확정 일자를 선택해 주세요.' }, 400);
        if (entry.date < range.from || entry.date > range.to) {
          return json({ error: `확정 일자는 업무 기간(${range.from} ~ ${range.to}) 안에서 선택해 주세요.` }, 400);
        }
        if (seen.has(entry.date) || taskDates.some((saved) => saved.taskKey === key && saved.date === entry.date)) {
          return json({ error: entries.length > 1 ? `이미 등록된 일자입니다: ${entry.date}` : '이미 등록된 일자입니다.' }, 409);
        }
        seen.add(entry.date);
      }
      const saved = entries.map((entry) => {
        const stored: PreviewTaskDate = {
          id: nextTaskDateId,
          taskKey: key,
          date: entry.date,
          label: entry.label,
          createdBy: user.displayName,
          createdAt: new Date().toISOString(),
        };
        nextTaskDateId += 1;
        taskDates.push(stored);
        return stored;
      });
      return json(batch?.length ? { dates: saved } : { date: saved[0] }, 201);
    }
    if (url.pathname === '/api/task-dates' && method === 'DELETE') {
      const index = taskDates.findIndex((entry) => entry.id === Number(body.id));
      if (index < 0) return json({ error: '존재하지 않는 일자입니다.' }, 404);
      taskDates.splice(index, 1);
      return json({ ok: true });
    }

    if (url.pathname === '/api/task-periods' && method === 'GET') return json({ periods: taskPeriods });
    if (url.pathname === '/api/task-periods' && method === 'PUT') {
      const personId = String(body.personId ?? '').trim();
      const taskTitle = String(body.taskTitle ?? '').trim();
      const startsOn = String(body.startsOn ?? '').trim();
      const endsOn = String(body.endsOn ?? '').trim();
      if (!currentTask(personId, taskTitle)) return json({ error: '존재하지 않는 업무입니다.' }, 400);
      if (!startsOn || !endsOn) return json({ error: '확정 기간의 시작일과 종료일을 모두 선택해 주세요.' }, 400);
      if (endsOn < startsOn) return json({ error: '종료일이 시작일보다 빠를 수 없습니다.' }, 400);
      if (startsOn < academicYearBounds.from || endsOn > academicYearBounds.to) {
        return json({ error: `확정 기간은 학년도(${academicYearBounds.from} ~ ${academicYearBounds.to}) 안에 있어야 합니다.` }, 400);
      }
      const key = taskKey(personId, taskTitle);
      /* A day already recorded outside the new period would be one the month grid can no longer
         mark, so the move is refused and the day at fault is named. */
      const stranded = taskDates.find((date) => date.taskKey === key && (date.date < startsOn || date.date > endsOn));
      if (stranded) {
        return json({ error: `이미 등록된 확정 일자 ${stranded.date}이(가) 새 기간을 벗어납니다. 해당 일자를 먼저 정리해 주세요.` }, 400);
      }
      const period = describePeriod({ taskKey: key, personId, taskTitle, startsOn, endsOn, setBy: user.displayName });
      const existing = taskPeriods.findIndex((saved) => saved.taskKey === key);
      if (existing >= 0) taskPeriods.splice(existing, 1, period);
      else taskPeriods.push(period);
      return json({ period });
    }
    if (url.pathname === '/api/task-periods' && method === 'DELETE') {
      const key = taskKey(String(body.personId ?? '').trim(), String(body.taskTitle ?? '').trim());
      const existing = taskPeriods.findIndex((period) => period.taskKey === key);
      if (existing < 0) return json({ error: '확정된 기간이 없는 업무입니다.' }, 404);
      taskPeriods.splice(existing, 1);
      return json({ ok: true });
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
      const frozen = handoverDocument?.status === 'pending' || handoverDocument?.status === 'approved' ? handoverDocument.status : null;
      if (frozen) {
        return json({ error: frozen === 'pending' ? '검토 중인 문서는 수정할 수 없습니다.' : '승인된 문서는 수정할 수 없습니다.' }, 409);
      }
      const entries = (Array.isArray(body.entries) ? body.entries : []) as HandoverEntry[];
      const bundles = (Array.isArray(body.bundles) ? body.bundles : []) as Array<Partial<WorkBundle> & Pick<WorkBundle, 'id' | 'title' | 'entryIds'>>;
      const now = new Date().toISOString();
      /* A correction save keeps the previous verdict: the approved units have to stay visibly
       * fixed, and the rejected ones have to keep the comment the author is working from. */
      const correcting = handoverDocument?.status === 'rejected';
      const verdicts = new Map((handoverDocument?.bundles ?? []).map((bundle) => [bundle.id, bundle]));
      handoverDocument = {
        ownerName: user.displayName,
        status: correcting ? 'rejected' : 'draft',
        entries,
        bundles: bundles.map((bundle) => {
          const previous = correcting ? verdicts.get(bundle.id) : undefined;
          return {
            ...bundle,
            decision: previous?.decision ?? null,
            comment: previous?.comment ?? '',
            previousComment: previous?.previousComment ?? '',
          };
        }),
        updatedAt: now,
        submittedAt: handoverDocument?.submittedAt ?? null,
        reviewedAt: handoverDocument?.reviewedAt ?? null,
        reviewedBy: handoverDocument?.reviewedBy ?? null,
      };
      return json({ document: handoverDocument });
    }
    if (url.pathname === '/api/handover' && method === 'POST') {
      if (!handoverDocument) return json({ error: '먼저 인수인계 항목을 저장해 주세요.' }, 404);
      const action = String(body.action ?? '');
      const now = new Date().toISOString();
      if (action === 'submit') {
        /* Approved units survive a correction round; only the returned ones go back to review. */
        handoverDocument = {
          ...handoverDocument,
          status: 'pending',
          submittedAt: now,
          updatedAt: now,
          reviewedAt: null,
          reviewedBy: null,
          bundles: handoverDocument.bundles.map((bundle) => ({
            ...bundle,
            decision: bundle.decision === 'approved' ? 'approved' : null,
            comment: '',
            /* the rejection a returned unit is answering outlives the verdict it came with */
            previousComment: bundle.decision === 'approved'
              ? ''
              : bundle.decision === 'rejected' ? bundle.comment : bundle.previousComment,
          })),
        };
      } else if (action === 'rollover') {
        handoverDocument = {
          ...handoverDocument,
          status: 'draft',
          submittedAt: null,
          reviewedAt: null,
          reviewedBy: null,
          updatedAt: now,
          bundles: handoverDocument.bundles.map((bundle) => ({ ...bundle, decision: null, comment: '', previousComment: '' })),
        };
      } else if (action === 'review') {
        const decisions = Array.isArray(body.decisions) ? body.decisions as Array<Record<string, unknown>> : [];
        /* An approval is final, so a later review can only settle the units that came back — and
         * the document's own verdict follows from all of them, not just the ones just decided. */
        const reviewed = handoverDocument.bundles.map((bundle) => {
          const verdict = bundle.decision === 'approved' ? undefined : decisions.find((candidate) => candidate.bundleId === bundle.id);
          if (!verdict) return bundle;
          const decision = verdict.decision as WorkBundle['decision'];
          /* the verdict answers whatever was outstanding, so the old request retires */
          return { ...bundle, decision, comment: decision === 'rejected' ? String(verdict.comment ?? '') : '', previousComment: '' };
        });
        handoverDocument = {
          ...handoverDocument,
          status: reviewed.some((bundle) => bundle.decision === 'rejected') ? 'rejected' : 'approved',
          reviewedAt: now,
          reviewedBy: user.displayName,
          updatedAt: now,
          bundles: reviewed,
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
