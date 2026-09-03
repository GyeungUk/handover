'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';
import { Button, Empty, Modal } from './ui';
import HandoverWorkspace from './HandoverWorkspace';
import Landing from './workspace/landing/Landing';
import AppHeader from './workspace/AppHeader';
import AllTeamsView from './workspace/views/AllTeamsView';
import TeamView from './workspace/views/TeamView';
import PersonView from './workspace/views/PersonView';
import TaskModal from './workspace/modals/TaskModal';
import SearchModal from './workspace/modals/SearchModal';
import CreateTaskModal, { type CreatedTask } from './workspace/modals/CreateTaskModal';
import { OrgContext, TodayContext, useResolvedToday } from './workspace/context';
import type { ScheduleChange } from './workspace/types';
import { seedTeams, taskKey, type Person, type Task, type TaskDate, type TaskPeriod, type Team } from './org-data';
import { academicYears, alignmentActionLabels, baseAcademicYear, shiftLabel, type AlignmentItem, type AlignmentResponse } from './academic-calendar';

/** The calendar screens — the ones a handover draft is started from, and returned to. */
type CalendarView = { type: 'all' } | { type: 'team'; teamId: string } | { type: 'person'; teamId: string; personId: string };
/**
 * `handover` carries the calendar screen it was opened from, so the header button and the
 * breadcrumb put the reader back where they actually were rather than on the landing page. A
 * shared `?view=handover` link has no origin, and both fall back to home.
 */
type View = { type: 'home' } | { type: 'handover'; from?: CalendarView } | CalendarView;
/**
 * The signed-in account, as `/api/auth/session` reports it. `email` is not what anyone types to sign
 * in — the employee number is — but it stays the key a handover document is filed under.
 */
export type SessionUser = { employeeId: string; displayName: string; email: string; role: 'admin' | 'member' };
type CustomMember = Person & { teamId: string };
type CustomTask = Task & { personId: string };
/** A confirmed date as the server files it: the task key travels with it, the task does not. */
type StoredTaskDate = TaskDate & { taskKey: string };
/**
 * A fixed period as the server files it.
 *
 * `startWeek` and `duration` are the slots the dates land on, resolved once on the server so the
 * year track can place a date-fixed task without re-deriving the mapping here. The dates stay the
 * record; the slots are only how such a task appears on a week-shaped view.
 */
type StoredTaskPeriod = TaskPeriod & {
  taskKey: string;
  personId: string;
  taskTitle: string;
  startWeek: number;
  duration: number;
};
type OrgResponse = { removedMemberIds: string[]; customMembers?: CustomMember[] };
type TaskCreateTarget = { initialPersonId?: string; initialTeamId?: string; initialMonth?: number };

function calendarViewFrom(type: string | null, params: URLSearchParams): CalendarView | null {
  if (type === 'all') return { type };
  const teamId = params.get('team');
  if (type === 'team' && teamId) return { type, teamId };
  const personId = params.get('person');
  if (type === 'person' && teamId && personId) return { type, teamId, personId };
  return null;
}

function viewFromLocation(): View {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('view');
  if (type === 'handover') {
    const from = calendarViewFrom(params.get('from'), params);
    return from ? { type, from } : { type };
  }
  return calendarViewFrom(type, params) ?? { type: 'home' };
}

function hrefForView(view: View) {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  url.searchParams.delete('from');
  url.searchParams.delete('team');
  url.searchParams.delete('person');
  if (view.type !== 'home') url.searchParams.set('view', view.type);
  /* on a handover link the team and person name the origin, not the screen being shown */
  const located = view.type === 'handover' ? view.from : view;
  if (view.type === 'handover' && view.from) url.searchParams.set('from', view.from.type);
  if (located && (located.type === 'team' || located.type === 'person')) url.searchParams.set('team', located.teamId);
  if (located && located.type === 'person') url.searchParams.set('person', located.personId);
  return `${url.pathname}${url.search}${url.hash}`;
}

const LOCATION_CHANGE_EVENT = 'workspace-location-change';
function subscribeToLocation(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(LOCATION_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(LOCATION_CHANGE_EVENT, onChange);
  };
}

/**
 * Compares a person's plan against the next academic calendar and proposes the moves.
 * Adopting a proposal writes through the same reschedule trail a manual move uses, so the reason
 * and the before/after weeks stay in the task's history.
 */
function CalendarCheckModal({ person, team, onReschedule, onClose }: { person: Person; team: Team; onReschedule: (personId: string, taskTitle: string, toStart: number, reason: string) => Promise<void>; onClose: () => void }) {
  const targetYears = academicYears.filter((item) => item.year !== baseAcademicYear);
  const [year, setYear] = useState(targetYears[targetYears.length - 1]?.year ?? baseAcademicYear + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AlignmentResponse | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [applyError, setApplyError] = useState('');
  const [busyId, setBusyId] = useState('');

  const run = async () => {
    setLoading(true);
    setError('');
    setApplyError('');
    setResult(null);
    setApplied([]);
    try {
      const response = await fetch('/api/calendar-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId: person.id, year }) });
      const raw = await response.text();
      let data: (AlignmentResponse & { error?: string }) | null = null;
      try { data = JSON.parse(raw) as AlignmentResponse & { error?: string }; } catch { /* handled below */ }
      if (!data) { setError('일정 점검 서버의 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
      if (!response.ok) setError(data.error ?? '일정을 점검하지 못했습니다.');
      else setResult(data);
    } catch (failure) {
      setError(failure instanceof Error ? `일정 점검 서버에 연결하지 못했습니다. (${failure.message})` : '일정 점검 서버에 연결하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const apply = async (item: AlignmentItem) => {
    if (!result) return;
    setBusyId(item.id);
    setApplyError('');
    try {
      await onReschedule(person.id, item.taskTitle, item.suggestedStart, `${result.toYear}학년도 학사일정 반영 · ${item.reason}`);
      setApplied((current) => [...current, item.id]);
    } catch (failure) {
      setApplyError(failure instanceof Error ? failure.message : '일정을 조정하지 못했습니다.');
    } finally {
      setBusyId('');
    }
  };

  const proposals = result ? result.items.filter((item) => item.action === 'shift') : [];
  const remaining = proposals.filter((item) => !applied.includes(item.id));
  const moved = result ? result.shifts.filter((item) => item.shift !== 0) : [];

  const applyAll = async () => {
    for (const item of remaining) await apply(item);
  };
  const countOf = (action: AlignmentItem['action']) => result?.items.filter((item) => item.action === action).length ?? 0;

  return (
    <Modal
      onClose={onClose}
      width="lg"
      className="cal-check-modal"
      title="학사일정 기준 일정 점검"
      description={`${person.name} 담당자의 연간 업무를 새 학년도 학사일정과 맞춰 봅니다. 조정하기 전까지 일정은 바뀌지 않습니다.`}
      dismissable={!busyId}
      initialFocus="dialog"
      footer={<>
        <p className="cal-check-foot-note">조정한 일정은 사유와 함께 업무의 변경 이력에 남습니다.</p>
        <Button variant="ghost" onClick={onClose} disabled={Boolean(busyId)}>닫기</Button>
        <Button
          variant="primary"
          onClick={applyAll}
          disabled={!result || remaining.length === 0 || Boolean(busyId)}
        >
          {remaining.length ? `남은 ${remaining.length}건 모두 조정` : '조정할 항목 없음'}
        </Button>
      </>}
    >
      <div className="cal-check-body" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
        <div className="cal-check-controls">
          <label>
            <span>대상 학년도</span>
            <select
              className="ui-select"
              value={year}
              onChange={(event) => { setYear(Number(event.target.value)); setResult(null); setApplied([]); }}
              disabled={loading}
            >
              {targetYears.map((item) => (
                <option value={item.year} key={item.year}>{baseAcademicYear}학년도 → {item.label}</option>
              ))}
            </select>
          </label>
          <Button variant={result ? 'outline' : 'primary'} onClick={run} disabled={loading} busy={loading}>
            {result ? '다시 점검' : '일정 점검'}
          </Button>
        </div>

        {loading && <div className="cal-check-loading"><i /><i /><i /><p>학사일정 변동과 업무 시기를 맞춰 보고 있습니다.</p></div>}
        {error && <p className="cal-check-error" role="alert">{error}</p>}

        {!loading && !error && !result && (
          <Empty
            glyph="↻"
            title="아직 점검하지 않았습니다"
            sub="대상 학년도를 고르고 일정 점검을 누르면, 옮겨야 할 업무와 그 근거를 함께 보여줍니다."
          />
        )}

        {result && <>
          {result.notice && <p className="cal-check-notice"><span aria-hidden="true">ⓘ</span>{result.notice}</p>}

          {/* The proposals are what the reader opened this for, so they come
              first. The twenty rows of academic-calendar movement behind them
              are the evidence, and evidence goes under a disclosure. */}
          <div className="cal-check-summary">
            <span className="shift">조정 제안 <b>{countOf('shift')}</b></span>
            <span className="review">확인 필요 <b>{countOf('review')}</b></span>
            <span className="keep">유지 <b>{countOf('keep')}</b></span>
            <small>{result.items.length}개 업무 점검함</small>
          </div>

          {applyError && <p className="cal-check-error" role="alert">{applyError}</p>}

          <div className="cal-check-list">{result.items.map((item) => {
            const isApplied = applied.includes(item.id);
            return <article className={`cal-check-card ${item.action} ${isApplied ? 'is-applied' : ''}`} key={item.id}>
              <div className="cal-check-card-head">
                <span className={`cal-action ${item.action}`}>{alignmentActionLabels[item.action]}</span>
                <b>{item.taskTitle}</b>
                {item.anchorEvent && <small>근거 · {item.anchorEvent} {item.anchorLabel}</small>}
              </div>
              <div className="cal-check-move">
                <span className="from">{item.currentLabel}</span>
                <i aria-hidden="true">→</i>
                <span className={item.action === 'shift' ? 'to' : 'to same'}>{item.suggestedLabel}</span>
                {item.action !== 'shift' && <em>변동 없음</em>}
              </div>
              {item.reason && <p className="cal-check-reason">{item.reason}</p>}
              {item.note && <p className="cal-check-note"><b>확인</b>{item.note}</p>}
              {item.action === 'shift' && <div className="cal-check-card-actions">
                {isApplied
                  ? <span className="cal-check-done">✓ 일정에 반영됨</span>
                  : <Button size="sm" variant="outline" onClick={() => apply(item)} disabled={busyId === item.id} busy={busyId === item.id}>이 일정으로 조정</Button>}
              </div>}
            </article>;
          })}</div>

          <details className="cal-check-shifts">
            <summary>
              <b>학사일정 변동</b>
              <small>{result.shifts.length}개 중 {moved.length}개 이동 · {result.fromYear}학년도 → {result.toYear}학년도</small>
              <i aria-hidden="true">›</i>
            </summary>
            {moved.length ? <ul>{moved.map((item) => <li key={item.name}>
              <span className="cal-phase">{item.phase}</span>
              <b>{item.name}</b>
              <em>{item.fromLabel} <i aria-hidden="true">→</i> {item.toLabel}</em>
              <span className={`cal-shift ${item.shift > 0 ? 'late' : 'early'}`}>{shiftLabel(item.shift)}</span>
            </li>)}</ul> : <p className="cal-check-none">올해와 달라진 학사일정이 없습니다.</p>}
          </details>
        </>}
      </div>
    </Modal>
  );
}

function MemberAdminModal({ allTeams, removedMemberIds, loading, loadError, onCreateTeam, onCreateMember, onRemove, onRestore, onClose }: {
  allTeams: Team[];
  removedMemberIds: string[];
  loading: boolean;
  loadError: string;
  onCreateTeam: (input: { title: string; english: string; description: string }) => Promise<void>;
  onCreateMember: (input: { teamId: string; name: string; role: string }) => Promise<void>;
  onRemove: (personId: string, teamId: string) => Promise<void>;
  onRestore: (personId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [confirmTarget, setConfirmTarget] = useState<{ team: Team; person: Person } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [createMode, setCreateMode] = useState<'team' | 'member' | null>(null);
  const [creating, setCreating] = useState(false);
  const [teamForm, setTeamForm] = useState({ title: '', english: '', description: '' });
  const [memberForm, setMemberForm] = useState({ teamId: allTeams[0]?.id ?? '', name: '', role: '' });
  const totalMembers = allTeams.reduce((sum, team) => sum + team.people.length, 0);
  const removedSet = useMemo(() => new Set(removedMemberIds), [removedMemberIds]);
  const removedPeople = allTeams.flatMap((team) => team.people.filter((person) => removedSet.has(person.id)).map((person) => ({ team, person })));
  const removedCount = removedPeople.length;
  const busy = Boolean(pendingId) || creating;

  const createTeam = async (event: FormEvent) => {
    event.preventDefault();
    setActionError('');
    setCreating(true);
    try {
      await onCreateTeam(teamForm);
      setTeamForm({ title: '', english: '', description: '' });
      setCreateMode(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '파트를 추가하지 못했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const createMember = async (event: FormEvent) => {
    event.preventDefault();
    setActionError('');
    setCreating(true);
    try {
      await onCreateMember(memberForm);
      setMemberForm((current) => ({ ...current, name: '', role: '' }));
      setCreateMode(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '담당자를 추가하지 못했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const removeConfirmed = async () => {
    if (!confirmTarget) return;
    setActionError('');
    setPendingId(confirmTarget.person.id);
    try {
      await onRemove(confirmTarget.person.id, confirmTarget.team.id);
      setConfirmTarget(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '담당자를 제외하지 못했습니다.');
    } finally {
      setPendingId(null);
    }
  };

  const restore = async (personId: string) => {
    setActionError('');
    setPendingId(personId);
    try {
      await onRestore(personId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '파트원을 복구하지 못했습니다.');
    } finally {
      setPendingId(null);
    }
  };

  return <>
    <Modal
      onClose={onClose}
      title="파트 · 담당자 관리"
      description="워크스페이스의 조직과 구성원을 추가하거나 관리합니다."
      width="xl"
      className="member-admin-modal"
      dismissable={!busy && !confirmTarget}
      initialFocus="dialog"
      footer={<><span>제외된 담당자는 업무 화면과 검색 결과에서 즉시 숨겨집니다.</span><span className="spacer" /><Button variant="primary" onClick={onClose} disabled={busy}>완료</Button></>}
    >
      <div className="member-admin-summary"><div><strong>{totalMembers - removedCount}</strong><span>활성 담당자</span></div><i /><div><strong>{allTeams.length}</strong><span>운영 파트</span></div><i /><div><strong>{removedCount}</strong><span>제외된 담당자</span></div><p><span>관리자 전용</span> 조직 변경은 즉시 반영됩니다.</p></div>
      <div className="member-admin-createbar"><button type="button" className={createMode === 'team' ? 'active' : ''} onClick={() => { setCreateMode(createMode === 'team' ? null : 'team'); setActionError(''); }} disabled={busy}><span>＋</span> 파트 추가</button><button type="button" className={createMode === 'member' ? 'active' : ''} onClick={() => { setCreateMode(createMode === 'member' ? null : 'member'); setActionError(''); }} disabled={busy || allTeams.length === 0}><span>＋</span> 담당자 추가</button></div>
      {createMode === 'team' && <form className="member-create-panel" onSubmit={createTeam}><div className="member-create-title"><span>파트 추가</span><b>새 파트 추가</b><small>파트명 외 항목은 비워 두면 기본 문구가 적용됩니다.</small></div><div className="member-create-grid"><label><span>파트명 <i>*</i></span><input name="teamTitle" autoComplete="off" autoFocus value={teamForm.title} maxLength={40} onChange={(event) => setTeamForm((current) => ({ ...current, title: event.target.value }))} placeholder="예: 국제협력…" required /></label><label><span>영문 파트명</span><input name="teamEnglish" autoComplete="off" value={teamForm.english} maxLength={80} onChange={(event) => setTeamForm((current) => ({ ...current, english: event.target.value }))} placeholder="예: GLOBAL PARTNERSHIP…" /></label><label className="wide"><span>파트 설명</span><input name="teamDescription" autoComplete="off" value={teamForm.description} maxLength={160} onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))} placeholder="예: 국제협정과 교류 업무…" /></label></div><div className="member-create-actions"><button type="button" onClick={() => setCreateMode(null)} disabled={creating}>취소</button><button type="submit" disabled={creating}>{creating ? '추가하는 중…' : '파트 추가'}</button></div></form>}
      {createMode === 'member' && <form className="member-create-panel" onSubmit={createMember}><div className="member-create-title"><span>담당자 추가</span><b>새 담당자 추가</b><small>소속 파트를 선택하고 담당 업무를 입력해 주세요.</small></div><div className="member-create-grid"><label><span>소속 파트 <i>*</i></span><select name="memberTeamId" value={memberForm.teamId} onChange={(event) => setMemberForm((current) => ({ ...current, teamId: event.target.value }))} required>{allTeams.map((team) => <option value={team.id} key={team.id}>{team.title}</option>)}</select></label><label><span>이름 <i>*</i></span><input name="memberName" autoComplete="name" autoFocus value={memberForm.name} maxLength={40} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} placeholder="예: 홍길동…" required /></label><label className="wide"><span>담당 업무 <i>*</i></span><input name="memberRole" autoComplete="off" value={memberForm.role} maxLength={80} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))} placeholder="예: 국제협정 · 의전…" required /></label></div><div className="member-create-actions"><button type="button" onClick={() => setCreateMode(null)} disabled={creating}>취소</button><button type="submit" disabled={creating}>{creating ? '추가하는 중…' : '담당자 추가'}</button></div></form>}
      {(loadError || actionError) && <div className="member-admin-error" role="alert">{actionError || loadError}</div>}
      <div className="member-admin-content">
        {loading ? <div className="member-admin-loading">담당자 정보를 불러오고 있습니다.</div> : allTeams.map((team) => {
          const activePeople = team.people.filter((person) => !removedSet.has(person.id));
          return <section className="member-team-group" key={team.id} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}><div className="member-team-title"><span><i />{team.title}</span><small>{activePeople.length}명</small></div>{activePeople.length ? activePeople.map((person) => <div className="member-admin-row" key={person.id}><span className="person-avatar" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>{person.role}</small></span><button type="button" onClick={() => setConfirmTarget({ team, person })} disabled={busy}>명단에서 제외</button></div>) : <p className="member-team-empty">현재 소속된 담당자가 없습니다.</p>}</section>;
        })}
        {removedPeople.length > 0 && <section className="removed-members"><div className="removed-members-title"><span>제외된 담당자</span><small>필요하면 다시 복구할 수 있습니다.</small></div>{removedPeople.map(({ team, person }) => <div className="member-admin-row removed" key={person.id}><span className="person-avatar" style={{ background: '#9aa1aa' }}>{person.initial}</span><span><b>{person.name}</b><small>{team.title} · {person.role}</small></span><button type="button" onClick={() => restore(person.id)} disabled={busy}>{pendingId === person.id ? '복구 중…' : '담당자 복구'}</button></div>)}</section>}
      </div>
    </Modal>
    {confirmTarget && <Modal
      onClose={() => { setConfirmTarget(null); setActionError(''); }}
      title={`${confirmTarget.person.name} 님을 명단에서 제외할까요?`}
      description={`${confirmTarget.team.title} · 업무 일정과 담당자 페이지가 숨겨지며, 이후 다시 복구할 수 있습니다.`}
      width="sm"
      className="member-confirm-modal"
      dismissable={!pendingId}
      initialFocus="dialog"
      footer={<><span className="spacer" /><Button variant="ghost" onClick={() => { setConfirmTarget(null); setActionError(''); }} disabled={Boolean(pendingId)}>취소</Button><Button variant="danger" onClick={removeConfirmed} busy={Boolean(pendingId)} busyLabel="제외하는 중…">명단에서 제외</Button></>}
    >
      <div className="member-confirm-copy"><span className="member-confirm-icon" aria-hidden="true">!</span><p>목록과 검색 결과에서 즉시 사라집니다. 기존 기록은 삭제되지 않습니다.</p>{actionError && <p className="member-admin-error" role="alert">{actionError}</p>}</div>
    </Modal>}
  </>;
}

export default function WorkspaceClient({ currentUser }: { currentUser: SessionUser }) {
  const locationHref = useSyncExternalStore(subscribeToLocation, () => window.location.href, () => '');
  const view = useMemo(() => locationHref ? viewFromLocation() : { type: 'home' } as View, [locationHref]);
  const today = useResolvedToday();
  const [searchOpen, setSearchOpen] = useState(false);
  const [memberAdminOpen, setMemberAdminOpen] = useState(false);
  const [removedMemberIds, setRemovedMemberIds] = useState<string[]>([]);
  const [customTeams, setCustomTeams] = useState<Team[]>([]);
  const [customMembers, setCustomMembers] = useState<CustomMember[]>([]);
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  /* `personId::title` of every seed-plan task somebody deleted; seed tasks are code, not rows. */
  const [removedTaskKeys, setRemovedTaskKeys] = useState<string[]>([]);
  /* every confirmed day, flat; `datesByTask` files them under the task that owns them */
  const [taskDates, setTaskDates] = useState<StoredTaskDate[]>([]);
  /* every task whose days are settled; the rest of the plan stays in week slots */
  const [taskPeriods, setTaskPeriods] = useState<StoredTaskPeriod[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersLoadError, setMembersLoadError] = useState('');
  const [taskFocus, setTaskFocus] = useState<{ personId: string; taskTitle: string } | null>(null);
  const [scheduleChanges, setScheduleChanges] = useState<ScheduleChange[]>([]);
  const [calendarCheckId, setCalendarCheckId] = useState<string | null>(null);
  const [taskCreateTarget, setTaskCreateTarget] = useState<TaskCreateTarget | null>(null);

  const navigate = (next: View, replace = false) => {
    const href = hrefForView(next);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === href) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', href);
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  };

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, []);

  /* every recorded move of a task, oldest first; the last one is the schedule in effect */
  const historyByTask = useMemo(() => {
    const map = new Map<string, ScheduleChange[]>();
    for (const change of scheduleChanges) {
      const trail = map.get(change.taskKey);
      if (trail) trail.push(change); else map.set(change.taskKey, [change]);
    }
    return map;
  }, [scheduleChanges]);

  /* the confirmed days of each task, oldest first — the order the server lists them in */
  const datesByTask = useMemo(() => {
    const map = new Map<string, TaskDate[]>();
    for (const { taskKey: key, ...date } of taskDates) {
      const dates = map.get(key);
      if (dates) dates.push(date); else map.set(key, [date]);
    }
    return map;
  }, [taskDates]);

  const periodsByTask = useMemo(
    () => new Map(taskPeriods.map((period) => [period.taskKey, period] as const)),
    [taskPeriods],
  );

  const allTeams = useMemo(() => {
    /* Deleting only ever hides a *seed* task — one authored here is deleted as a row and is simply
       absent from `customTasks` — so the filter runs before the authored tasks are merged in. That
       is what lets a deleted seed task's name be used again for a new one. */
    const removed = new Set(removedTaskKeys);
    const keep = (person: Person) => person.tasks.filter((task) => !removed.has(taskKey(person.id, task.title)));
    const merged = [...seedTeams, ...customTeams].map((team) => ({
      ...team,
      people: team.people.map((person) => ({ ...person, tasks: keep(person) })),
    }));
    for (const member of customMembers) {
      const team = merged.find((item) => item.id === member.teamId);
      if (team && !team.people.some((person) => person.id === member.id)) {
        team.people.push({ ...member, tasks: keep(member) });
      }
    }
    for (const task of customTasks) {
      for (const team of merged) {
        const person = team.people.find((item) => item.id === task.personId);
        if (person && !person.tasks.some((item) => item.title === task.title)) {
          person.tasks = [...person.tasks, {
            title: task.title,
            start: task.start,
            duration: task.duration,
            note: task.note,
          }];
          break;
        }
      }
    }
    return merged;
  }, [customMembers, customTasks, customTeams, removedTaskKeys]);

  const teams = useMemo(() => allTeams.map((team) => ({
    ...team,
    people: team.people.filter((person) => !removedMemberIds.includes(person.id)).map((person) => ({
      ...person,
      tasks: person.tasks.map((task) => {
        const key = taskKey(person.id, task.title);
        const trail = historyByTask.get(key);
        const current = trail?.[trail.length - 1]?.toStart;
        const moved = current === undefined || current === task.start ? task : { ...task, start: current, movedFrom: task.start };
        const dates = datesByTask.get(key);
        const dated = dates ? { ...moved, dates } : moved;
        /* Last, and it overrules the move: a task fixed to dates sits on the slots those dates fall
           in, whatever the trail last said. The ghost of an older move goes with it — there is no
           week it was moved from that means anything once the days are the record. */
        const period = periodsByTask.get(key);
        if (!period) return dated;
        return {
          ...dated,
          start: period.startWeek,
          duration: period.duration,
          movedFrom: undefined,
          period: { startsOn: period.startsOn, endsOn: period.endsOn, setBy: period.setBy },
        };
      }).sort((first, second) => first.start - second.start),
    })),
  })), [allTeams, removedMemberIds, historyByTask, datesByTask, periodsByTask]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/members', { signal: controller.signal }),
      fetch('/api/teams', { signal: controller.signal }),
      fetch('/api/tasks', { signal: controller.signal }),
    ])
      .then(async ([membersResponse, teamsResponse, tasksResponse]) => {
        if (!membersResponse.ok || !teamsResponse.ok || !tasksResponse.ok) throw new Error('조직 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        const [members, teamData, taskData] = await Promise.all([
          membersResponse.json() as Promise<OrgResponse>,
          teamsResponse.json() as Promise<{ customTeams?: Team[] }>,
          tasksResponse.json() as Promise<{ tasks?: CustomTask[]; removedTaskKeys?: string[] }>,
        ]);
        return { members, teamData, taskData };
      })
      .then(({ members, teamData, taskData }) => {
        setRemovedMemberIds(members.removedMemberIds);
        setCustomMembers(members.customMembers ?? []);
        setCustomTeams(teamData.customTeams ?? []);
        setCustomTasks(taskData.tasks ?? []);
        setRemovedTaskKeys(taskData.removedTaskKeys ?? []);
      })
      .catch((error) => { if (error instanceof Error && error.name !== 'AbortError') setMembersLoadError(error.message); })
      .finally(() => setMembersLoading(false));
    return () => controller.abort();
  }, []);

  const createTeam = async (input: { title: string; english: string; description: string }) => {
    const response = await fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const payload = await response.json().catch(() => null) as { team?: Team; error?: string } | null;
    if (!response.ok || !payload?.team) throw new Error(payload?.error ?? '파트를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    setCustomTeams((current) => [...current, payload.team!]);
  };

  const createMember = async (input: { teamId: string; name: string; role: string }) => {
    const response = await fetch('/api/members', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const payload = await response.json().catch(() => null) as { member?: CustomMember; error?: string } | null;
    if (!response.ok || !payload?.member) throw new Error(payload?.error ?? '담당자를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    setCustomMembers((current) => [...current, payload.member!]);
  };

  const createTask = async (input: CreatedTask) => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => null) as { task?: CustomTask; tasks?: CustomTask[]; error?: string } | null;
    const savedTasks = payload?.tasks ?? (payload?.task ? [payload.task] : []);
    if (!response.ok || savedTasks.length === 0) {
      throw new Error(payload?.error ?? '일정을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    setCustomTasks((current) => [...current, ...savedTasks]);
    /* A task created with dates comes back as a task, not as a period — but the server derived its
       slots from those dates and they are on `saved`, so the period is recorded from what was sent
       rather than by re-fetching the whole set to learn what we already know. */
    if (input.startsOn && input.endsOn) {
      const created = savedTasks.map((saved): StoredTaskPeriod => ({
        taskKey: taskKey(saved.personId, saved.title),
        personId: saved.personId,
        taskTitle: saved.title,
        startsOn: input.startsOn as string,
        endsOn: input.endsOn as string,
        startWeek: saved.start,
        duration: saved.duration,
        setBy: currentUser.displayName,
      }));
      setTaskPeriods((current) => [...current, ...created]);
    }
    const targetIds = new Set(savedTasks.map((saved) => saved.personId));
    const team = teams.find((item) => item.people.some((person) => targetIds.has(person.id)));
    if (team && savedTasks.length > 1) navigate({ type: 'team', teamId: team.id });
    else if (team) navigate({ type: 'person', teamId: team.id, personId: savedTasks[0].personId });
  };

  /**
   * Removes a task from the calendar for everyone. The server decides which of the two kinds it is;
   * the reply says nothing back, so both local shapes are updated and whichever one held the task
   * is the one that changes. Its reschedule trail goes too — the server drops it, and leaving it
   * here would re-apply a move to a task that no longer exists.
   */
  const deleteTask = async (personId: string, taskTitle: string) => {
    const response = await fetch('/api/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, taskTitle }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? '일정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    const key = taskKey(personId, taskTitle);
    const authored = customTasks.some((task) => task.personId === personId && task.title === taskTitle);
    if (authored) setCustomTasks((current) => current.filter((task) => !(task.personId === personId && task.title === taskTitle)));
    else setRemovedTaskKeys((current) => current.includes(key) ? current : [...current, key]);
    setScheduleChanges((current) => current.filter((change) => change.taskKey !== key));
    setTaskDates((current) => current.filter((date) => date.taskKey !== key));
    setTaskPeriods((current) => current.filter((period) => period.taskKey !== key));
    setTaskFocus(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/schedules', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('일정 변경 내역을 불러오지 못했습니다.');
        return response.json() as Promise<{ changes: ScheduleChange[] }>;
      })
      .then((data) => setScheduleChanges(data.changes))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  /* The whole set at once: the month grid marks days across every task on screen, not one task.
     The periods come with them because a task's days are drawn from whichever of the two it has,
     and a grid that had the confirmed dates but not yet the period would draw the wrong band. */
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/task-dates', { signal: controller.signal }),
      fetch('/api/task-periods', { signal: controller.signal }),
    ])
      .then(async ([datesResponse, periodsResponse]) => {
        if (!datesResponse.ok || !periodsResponse.ok) throw new Error('확정 일자를 불러오지 못했습니다.');
        return Promise.all([
          datesResponse.json() as Promise<{ dates?: StoredTaskDate[] }>,
          periodsResponse.json() as Promise<{ periods?: StoredTaskPeriod[] }>,
        ]);
      })
      .then(([dateData, periodData]) => {
        setTaskDates(dateData.dates ?? []);
        setTaskPeriods(periodData.periods ?? []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const addTaskDate = async (personId: string, taskTitle: string, date: string, label: string) => {
    const response = await fetch('/api/task-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, taskTitle, date, label }),
    });
    const payload = await response.json().catch(() => null) as { date?: StoredTaskDate; error?: string } | null;
    if (!response.ok || !payload?.date) throw new Error(payload?.error ?? '확정 일자를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const saved = payload.date;
    setTaskDates((current) => [...current, saved]);
  };

  /* One write for the whole paste: a batch that half lands leaves the calendar in a state nobody
     asked for and no way to tell from here which half it was. */
  const addTaskDates = async (personId: string, taskTitle: string, dates: { date: string; label: string }[]) => {
    const response = await fetch('/api/task-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, taskTitle, dates }),
    });
    const payload = await response.json().catch(() => null) as { dates?: StoredTaskDate[]; error?: string } | null;
    if (!response.ok || !payload?.dates) throw new Error(payload?.error ?? '확정 일자를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const saved = payload.dates;
    setTaskDates((current) => [...current, ...saved]);
  };

  const removeTaskDate = async (id: number) => {
    const response = await fetch('/api/task-dates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? '확정 일자를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    setTaskDates((current) => current.filter((date) => date.id !== id));
  };

  /**
   * Fixes a task to real dates, or moves the dates it is already fixed to.
   *
   * The reply carries the week slots the server derived from the dates, so the year track re-places
   * the task from the same arithmetic the month grid draws it with rather than from a second guess
   * made here. Idempotent by task, which is why setting and moving are one call.
   */
  const setTaskPeriod = async (personId: string, taskTitle: string, startsOn: string, endsOn: string) => {
    const response = await fetch('/api/task-periods', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, taskTitle, startsOn, endsOn }),
    });
    const payload = await response.json().catch(() => null) as { period?: StoredTaskPeriod; error?: string } | null;
    if (!response.ok || !payload?.period) throw new Error(payload?.error ?? '확정 기간을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const saved = payload.period;
    setTaskPeriods((current) => [...current.filter((period) => period.taskKey !== saved.taskKey), saved]);
  };

  /* Returning a task to its week slots. They never stopped being the task's own — the period only
     outranked them — so dropping it locally is the whole of the change. */
  const clearTaskPeriod = async (personId: string, taskTitle: string) => {
    const response = await fetch('/api/task-periods', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, taskTitle }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? '확정 기간을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    setTaskPeriods((current) => current.filter((period) => period.taskKey !== taskKey(personId, taskTitle)));
  };

  const removeMember = async (personId: string, teamId: string) => {
    const response = await fetch('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) });
    if (!response.ok) throw new Error('담당자를 제외하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    setRemovedMemberIds((current) => current.includes(personId) ? current : [personId, ...current]);
    if (view.type === 'person' && view.personId === personId) navigate({ type: 'team', teamId });
    setTaskFocus((current) => current?.personId === personId ? null : current);
  };

  const restoreMember = async (personId: string) => {
    const response = await fetch('/api/members', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) });
    if (!response.ok) throw new Error('파트원을 복구하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    setRemovedMemberIds((current) => current.filter((id) => id !== personId));
  };

  const rescheduleTask = async (personId: string, taskTitle: string, toStart: number, reason: string) => {
    const response = await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId, taskTitle, toStart, reason }) });
    const payload = await response.json().catch(() => null) as { change?: ScheduleChange; error?: string } | null;
    if (!response.ok || !payload?.change) throw new Error(payload?.error ?? '일정을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const saved = payload.change;
    setScheduleChanges((current) => [...current, saved]);
  };

  const openTeam = (teamId: string) => navigate({ type: 'team', teamId });
  const openPerson = (teamId: string, personId: string) => navigate({ type: 'person', teamId, personId });

  /*
   * Where "back" goes from the handover screen. On a calendar screen this is that screen, and it
   * travels into the handover link; on the handover screen it is the origin the link carried. The
   * header button and the breadcrumb both read it, so the two never disagree.
   */
  const calendarOrigin: CalendarView | null =
    view.type === 'all' || view.type === 'team' || view.type === 'person' ? view
      : view.type === 'handover' ? view.from ?? null
        : null;
  /* Null once the origin team or person is gone from the roster, which drops back to home. */
  const originLabel = useMemo(() => {
    if (!calendarOrigin) return null;
    if (calendarOrigin.type === 'all') return '전체 업무 캘린더';
    const team = teams.find((item) => item.id === calendarOrigin.teamId);
    if (!team) return null;
    if (calendarOrigin.type === 'team') return `${team.title} 캘린더`;
    const person = team.people.find((item) => item.id === calendarOrigin.personId);
    return person ? `${person.name} 캘린더` : null;
  }, [calendarOrigin, teams]);
  const returnTo = originLabel && calendarOrigin ? calendarOrigin : { type: 'home' } as View;
  const openHandover = () => navigate(calendarOrigin ? { type: 'handover', from: calendarOrigin } : { type: 'handover' });
  const leaveHandover = () => navigate(returnTo);
  const selectedTeam = view.type === 'team' || view.type === 'person' ? teams.find((team) => team.id === view.teamId) ?? null : null;
  const selectedPerson = view.type === 'person' ? selectedTeam?.people.find((person) => person.id === view.personId) ?? null : null;

  useEffect(() => {
    if (membersLoading) return;
    const invalidTeam = (view.type === 'team' || view.type === 'person') && !selectedTeam;
    const invalidPerson = view.type === 'person' && !selectedPerson;
    if (invalidTeam || invalidPerson) navigate({ type: 'home' }, true);
  }, [membersLoading, selectedPerson, selectedTeam, view]);

  /*
   * These screens are swapped in place instead of using route navigation, so the browser does not
   * reset the document scroll position for us. Without this, opening a team from halfway down the
   * landing page mounts the new screen at the same Y offset and its heading, stats and first rows
   * appear to have been cut off. Treat every workspace view change like a real page navigation.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view]);

  const showTask = (task: Task, person: Person) => setTaskFocus({ personId: person.id, taskTitle: task.title });
  /* resolved from `teams` on every render so a saved move updates the open modal */
  const taskDetail = useMemo(() => {
    if (!taskFocus) return null;
    for (const team of teams) {
      const person = team.people.find((item) => item.id === taskFocus.personId);
      if (!person) continue;
      const task = person.tasks.find((item) => item.title === taskFocus.taskTitle);
      return task ? { task, person, team } : null;
    }
    return null;
  }, [taskFocus, teams]);
  return <OrgContext.Provider value={teams}><TodayContext.Provider value={today}><div className={`site-shell ${view.type !== 'home' ? 'dashboard-shell' : ''}`}>
    <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
    <AppHeader user={currentUser} compact={view.type !== 'home'} handoverActive={view.type === 'handover'} handoverBackLabel={originLabel ? '캘린더로 돌아가기' : '홈으로 돌아가기'} onHome={() => navigate({ type: 'home' })} onHandover={view.type === 'handover' ? leaveHandover : openHandover} onSearch={() => setSearchOpen(true)} onAddTask={() => setTaskCreateTarget({})} onManageMembers={() => setMemberAdminOpen(true)} />
    <div id="main-content" tabIndex={-1}>
    {view.type === 'home' && <Landing onAll={() => navigate({ type: 'all' })} onTeam={openTeam} onPerson={openPerson} />}
    {view.type === 'handover' && <HandoverWorkspace currentUser={currentUser} onHome={() => navigate({ type: 'home' })} origin={originLabel ? { label: originLabel, onOpen: leaveHandover } : null} />}
    {view.type === 'all' && <AllTeamsView onHome={() => navigate({ type: 'home' })} onTeam={openTeam} onPerson={openPerson} />}
    {view.type === 'team' && selectedTeam && <TeamView team={selectedTeam} onHome={() => navigate({ type: 'home' })} onAll={() => navigate({ type: 'all' })} onTeam={openTeam} onPerson={(id) => openPerson(selectedTeam.id, id)} onTask={showTask} onAddTask={() => setTaskCreateTarget({ initialTeamId: selectedTeam.id })} />}
    {view.type === 'person' && selectedTeam && selectedPerson && <PersonView team={selectedTeam} person={selectedPerson} onHome={() => navigate({ type: 'home' })} onAll={() => navigate({ type: 'all' })} onTeam={() => openTeam(selectedTeam.id)} onTask={showTask} onCalendarCheck={() => setCalendarCheckId(selectedPerson.id)} onAddTask={(initialMonth) => setTaskCreateTarget({ initialPersonId: selectedPerson.id, initialTeamId: selectedTeam.id, initialMonth })} />}
    </div>
    {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onPerson={(teamId, personId) => { openPerson(teamId, personId); setSearchOpen(false); }} />}
    {taskCreateTarget && <CreateTaskModal teams={teams} {...taskCreateTarget} onCreate={createTask} onClose={() => setTaskCreateTarget(null)} />}
    {memberAdminOpen && currentUser.role === 'admin' && <MemberAdminModal allTeams={allTeams} removedMemberIds={removedMemberIds} loading={membersLoading} loadError={membersLoadError} onCreateTeam={createTeam} onCreateMember={createMember} onRemove={removeMember} onRestore={restoreMember} onClose={() => setMemberAdminOpen(false)} />}
    {calendarCheckId && selectedTeam && selectedPerson && selectedPerson.id === calendarCheckId && <CalendarCheckModal person={selectedPerson} team={selectedTeam} onReschedule={rescheduleTask} onClose={() => setCalendarCheckId(null)} />}
    {taskDetail && <TaskModal {...taskDetail} history={historyByTask.get(taskKey(taskDetail.person.id, taskDetail.task.title)) ?? []} onReschedule={rescheduleTask} onDelete={deleteTask} onAddDate={addTaskDate} onAddDates={addTaskDates} onRemoveDate={removeTaskDate} onSetPeriod={setTaskPeriod} onClearPeriod={clearTaskPeriod} onClose={() => setTaskFocus(null)} />}
  </div></TodayContext.Provider></OrgContext.Provider>;
}
