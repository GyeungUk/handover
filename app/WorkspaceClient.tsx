'use client';

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Empty, Modal } from './ui';
import HandoverWorkspace from './HandoverWorkspace';
import Landing from './workspace/landing/Landing';
import AppHeader from './workspace/AppHeader';
import AllTeamsView from './workspace/views/AllTeamsView';
import TeamView from './workspace/views/TeamView';
import PersonView from './workspace/views/PersonView';
import TaskModal from './workspace/modals/TaskModal';
import SearchModal from './workspace/modals/SearchModal';
import { OrgContext, TodayContext, useResolvedToday } from './workspace/context';
import type { ScheduleChange } from './workspace/types';
import { seedTeams, taskKey, type Person, type Task, type Team } from './org-data';
import { academicYears, alignmentActionLabels, baseAcademicYear, shiftLabel, type AlignmentItem, type AlignmentResponse } from './academic-calendar';

type View = { type: 'home' } | { type: 'handover' } | { type: 'all' } | { type: 'team'; teamId: string } | { type: 'person'; teamId: string; personId: string };
/**
 * The signed-in account, as `/api/auth/session` reports it. `email` is not what anyone types to sign
 * in — the employee number is — but it stays the key a handover document is filed under.
 */
export type SessionUser = { employeeId: string; displayName: string; email: string; role: 'admin' | 'member' };
type CustomMember = Person & { teamId: string };
type OrgResponse = { removedMemberIds: string[]; customMembers?: CustomMember[] };

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

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      if (confirmTarget) setConfirmTarget(null);
      else if (createMode) setCreateMode(null);
      else onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, confirmTarget, createMode, onClose]);

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

  return <div className="modal-backdrop member-admin-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
    <section className="member-admin-modal" role="dialog" aria-modal="true" aria-labelledby="member-admin-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="member-admin-head"><div><h2 id="member-admin-title">파트 · 담당자 관리</h2><p>워크스페이스의 조직과 구성원을 추가하거나 관리합니다.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="파트 · 담당자 관리 닫기">×</button></header>
      <div className="member-admin-summary"><div><strong>{totalMembers - removedCount}</strong><span>활성 담당자</span></div><i /><div><strong>{allTeams.length}</strong><span>운영 파트</span></div><i /><div><strong>{removedCount}</strong><span>제외된 담당자</span></div><p><span>관리자 전용</span> 조직 변경은 즉시 반영됩니다.</p></div>
      <div className="member-admin-createbar"><button type="button" className={createMode === 'team' ? 'active' : ''} onClick={() => { setCreateMode(createMode === 'team' ? null : 'team'); setActionError(''); }} disabled={busy}><span>＋</span> 파트 추가</button><button type="button" className={createMode === 'member' ? 'active' : ''} onClick={() => { setCreateMode(createMode === 'member' ? null : 'member'); setActionError(''); }} disabled={busy || allTeams.length === 0}><span>＋</span> 담당자 추가</button></div>
      {createMode === 'team' && <form className="member-create-panel" onSubmit={createTeam}><div className="member-create-title"><span>파트 추가</span><b>새 파트 추가</b><small>파트명 외 항목은 비워 두면 기본 문구가 적용됩니다.</small></div><div className="member-create-grid"><label><span>파트명 <i>*</i></span><input autoFocus value={teamForm.title} maxLength={40} onChange={(event) => setTeamForm((current) => ({ ...current, title: event.target.value }))} placeholder="예: 국제협력" required /></label><label><span>영문 파트명</span><input value={teamForm.english} maxLength={80} onChange={(event) => setTeamForm((current) => ({ ...current, english: event.target.value }))} placeholder="예: GLOBAL PARTNERSHIP" /></label><label className="wide"><span>파트 설명</span><input value={teamForm.description} maxLength={160} onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))} placeholder="이 파트가 담당하는 주요 업무를 입력하세요." /></label></div><div className="member-create-actions"><button type="button" onClick={() => setCreateMode(null)} disabled={creating}>취소</button><button type="submit" disabled={creating}>{creating ? '추가하는 중…' : '파트 추가'}</button></div></form>}
      {createMode === 'member' && <form className="member-create-panel" onSubmit={createMember}><div className="member-create-title"><span>담당자 추가</span><b>새 담당자 추가</b><small>소속 파트를 선택하고 담당 업무를 입력해 주세요.</small></div><div className="member-create-grid"><label><span>소속 파트 <i>*</i></span><select value={memberForm.teamId} onChange={(event) => setMemberForm((current) => ({ ...current, teamId: event.target.value }))} required>{allTeams.map((team) => <option value={team.id} key={team.id}>{team.title}</option>)}</select></label><label><span>이름 <i>*</i></span><input autoFocus value={memberForm.name} maxLength={40} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} placeholder="담당자 이름" required /></label><label className="wide"><span>담당 업무 <i>*</i></span><input value={memberForm.role} maxLength={80} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))} placeholder="예: 국제협정 · 의전" required /></label></div><div className="member-create-actions"><button type="button" onClick={() => setCreateMode(null)} disabled={creating}>취소</button><button type="submit" disabled={creating}>{creating ? '추가하는 중…' : '담당자 추가'}</button></div></form>}
      {(loadError || actionError) && <div className="member-admin-error" role="alert">{actionError || loadError}</div>}
      <div className="member-admin-content">
        {loading ? <div className="member-admin-loading">담당자 정보를 불러오고 있습니다.</div> : allTeams.map((team) => {
          const activePeople = team.people.filter((person) => !removedSet.has(person.id));
          return <section className="member-team-group" key={team.id} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}><div className="member-team-title"><span><i />{team.title}</span><small>{activePeople.length}명</small></div>{activePeople.length ? activePeople.map((person) => <div className="member-admin-row" key={person.id}><span className="person-avatar" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>{person.role}</small></span><button type="button" onClick={() => setConfirmTarget({ team, person })} disabled={busy}>명단에서 제외</button></div>) : <p className="member-team-empty">현재 소속된 담당자가 없습니다.</p>}</section>;
        })}
        {removedPeople.length > 0 && <section className="removed-members"><div className="removed-members-title"><span>제외된 담당자</span><small>필요하면 다시 복구할 수 있습니다.</small></div>{removedPeople.map(({ team, person }) => <div className="member-admin-row removed" key={person.id}><span className="person-avatar" style={{ background: '#9aa1aa' }}>{person.initial}</span><span><b>{person.name}</b><small>{team.title} · {person.role}</small></span><button type="button" onClick={() => restore(person.id)} disabled={busy}>{pendingId === person.id ? '복구 중…' : '담당자 복구'}</button></div>)}</section>}
      </div>
      <footer className="member-admin-footer"><span>제외된 담당자는 업무 화면과 검색 결과에서 즉시 숨겨집니다.</span><button type="button" onClick={onClose} disabled={busy}>완료</button></footer>
      {confirmTarget && <div className="member-confirm-layer"><div className="member-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="member-confirm-title"><span className="member-confirm-icon">!</span><small>{confirmTarget.team.title}</small><h3 id="member-confirm-title">{confirmTarget.person.name} 님을 명단에서 제외할까요?</h3><p>해당 파트원의 업무 일정과 담당자 페이지가 워크스페이스에서 숨겨집니다. 이후 파트원 관리에서 복구할 수 있습니다.</p><div>{actionError && <span role="alert">{actionError}</span>}<button type="button" onClick={() => { setConfirmTarget(null); setActionError(''); }} disabled={Boolean(pendingId)}>취소</button><button type="button" className="danger" onClick={removeConfirmed} disabled={Boolean(pendingId)}>{pendingId ? '제외하는 중…' : '명단에서 제외'}</button></div></div></div>}
    </section>
  </div>;
}

export default function WorkspaceClient({ currentUser }: { currentUser: SessionUser }) {
  const [view, setView] = useState<View>({ type: 'home' });
  const today = useResolvedToday();
  const [searchOpen, setSearchOpen] = useState(false);
  const [memberAdminOpen, setMemberAdminOpen] = useState(false);
  const [removedMemberIds, setRemovedMemberIds] = useState<string[]>([]);
  const [customTeams, setCustomTeams] = useState<Team[]>([]);
  const [customMembers, setCustomMembers] = useState<CustomMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersLoadError, setMembersLoadError] = useState('');
  const [taskFocus, setTaskFocus] = useState<{ personId: string; taskTitle: string } | null>(null);
  const [scheduleChanges, setScheduleChanges] = useState<ScheduleChange[]>([]);
  const [calendarCheckId, setCalendarCheckId] = useState<string | null>(null);

  /* every recorded move of a task, oldest first; the last one is the schedule in effect */
  const historyByTask = useMemo(() => {
    const map = new Map<string, ScheduleChange[]>();
    for (const change of scheduleChanges) {
      const trail = map.get(change.taskKey);
      if (trail) trail.push(change); else map.set(change.taskKey, [change]);
    }
    return map;
  }, [scheduleChanges]);

  const allTeams = useMemo(() => {
    const merged = [...seedTeams, ...customTeams].map((team) => ({ ...team, people: [...team.people] }));
    for (const member of customMembers) {
      const team = merged.find((item) => item.id === member.teamId);
      if (team && !team.people.some((person) => person.id === member.id)) team.people.push(member);
    }
    return merged;
  }, [customMembers, customTeams]);

  const teams = useMemo(() => allTeams.map((team) => ({
    ...team,
    people: team.people.filter((person) => !removedMemberIds.includes(person.id)).map((person) => ({
      ...person,
      tasks: person.tasks.map((task) => {
        const trail = historyByTask.get(taskKey(person.id, task.title));
        const current = trail?.[trail.length - 1]?.toStart;
        return current === undefined || current === task.start ? task : { ...task, start: current, movedFrom: task.start };
      }).sort((first, second) => first.start - second.start),
    })),
  })), [allTeams, removedMemberIds, historyByTask]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/members', { signal: controller.signal }),
      fetch('/api/teams', { signal: controller.signal }),
    ])
      .then(async ([membersResponse, teamsResponse]) => {
        if (!membersResponse.ok || !teamsResponse.ok) throw new Error('조직 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        const [members, teamData] = await Promise.all([
          membersResponse.json() as Promise<OrgResponse>,
          teamsResponse.json() as Promise<{ customTeams?: Team[] }>,
        ]);
        return { members, teamData };
      })
      .then(({ members, teamData }) => {
        setRemovedMemberIds(members.removedMemberIds);
        setCustomMembers(members.customMembers ?? []);
        setCustomTeams(teamData.customTeams ?? []);
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

  const removeMember = async (personId: string, teamId: string) => {
    const response = await fetch('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) });
    if (!response.ok) throw new Error('담당자를 제외하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    setRemovedMemberIds((current) => current.includes(personId) ? current : [personId, ...current]);
    if (view.type === 'person' && view.personId === personId) setView({ type: 'team', teamId });
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

  const openTeam = (teamId: string) => setView({ type: 'team', teamId });
  const openPerson = (teamId: string, personId: string) => setView({ type: 'person', teamId, personId });
  const selectedTeam = view.type === 'team' || view.type === 'person' ? teams.find((team) => team.id === view.teamId) ?? null : null;
  const selectedPerson = view.type === 'person' ? selectedTeam?.people.find((person) => person.id === view.personId) ?? null : null;

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
    <AppHeader user={currentUser} compact={view.type !== 'home'} handoverActive={view.type === 'handover'} onHome={() => setView({ type: 'home' })} onHandover={() => setView({ type: 'handover' })} onSearch={() => setSearchOpen(true)} onManageMembers={() => setMemberAdminOpen(true)} />
    {view.type === 'home' && <Landing onAll={() => setView({ type: 'all' })} onTeam={openTeam} onPerson={openPerson} />}
    {view.type === 'handover' && <HandoverWorkspace currentUser={currentUser} onHome={() => setView({ type: 'home' })} />}
    {view.type === 'all' && <AllTeamsView onHome={() => setView({ type: 'home' })} onTeam={openTeam} onPerson={openPerson} />}
    {view.type === 'team' && selectedTeam && <TeamView team={selectedTeam} onHome={() => setView({ type: 'home' })} onAll={() => setView({ type: 'all' })} onTeam={openTeam} onPerson={(id) => openPerson(selectedTeam.id, id)} onTask={showTask} />}
    {view.type === 'person' && selectedTeam && selectedPerson && <PersonView team={selectedTeam} person={selectedPerson} onHome={() => setView({ type: 'home' })} onAll={() => setView({ type: 'all' })} onTeam={() => openTeam(selectedTeam.id)} onTask={showTask} onCalendarCheck={() => setCalendarCheckId(selectedPerson.id)} />}
    {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onPerson={(teamId, personId) => { openPerson(teamId, personId); setSearchOpen(false); }} />}
    {memberAdminOpen && currentUser.role === 'admin' && <MemberAdminModal allTeams={allTeams} removedMemberIds={removedMemberIds} loading={membersLoading} loadError={membersLoadError} onCreateTeam={createTeam} onCreateMember={createMember} onRemove={removeMember} onRestore={restoreMember} onClose={() => setMemberAdminOpen(false)} />}
    {calendarCheckId && selectedTeam && selectedPerson && selectedPerson.id === calendarCheckId && <CalendarCheckModal person={selectedPerson} team={selectedTeam} onReschedule={rescheduleTask} onClose={() => setCalendarCheckId(null)} />}
    {taskDetail && <TaskModal {...taskDetail} history={historyByTask.get(taskKey(taskDetail.person.id, taskDetail.task.title)) ?? []} onReschedule={rescheduleTask} onClose={() => setTaskFocus(null)} />}
  </div></TodayContext.Provider></OrgContext.Provider>;
}
