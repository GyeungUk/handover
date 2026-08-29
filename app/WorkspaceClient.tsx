'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import HandoverWorkspace from './HandoverWorkspace';
import { WEEKS_IN_YEAR, locateToday, months, noToday, seedTeams, taskKey, weekLabel, type Person, type Task, type Team, type Today } from './org-data';
import { academicYears, alignmentActionLabels, baseAcademicYear, shiftLabel, type AlignmentItem, type AlignmentResponse } from './academic-calendar';

/** one recorded move of a task, kept as an append-only trail so the reason survives */
type ScheduleChange = { taskKey: string; personId: string; taskTitle: string; fromStart: number; toStart: number; reason: string; changedBy: string; changedAt: string };
type View = { type: 'home' } | { type: 'handover' } | { type: 'all' } | { type: 'team'; teamId: string } | { type: 'person'; teamId: string; personId: string };
export type SessionUser = { displayName: string; email: string; role: 'admin' | 'member' };

const TodayContext = createContext<Today>(noToday);
const useToday = () => useContext(TodayContext);

/* the marker resolves on the client only, so the server and client first paint match */
let clientToday: Today | null = null;
const subscribeToday = () => () => {};
const readToday = () => (clientToday ??= locateToday(new Date()));
const readServerToday = () => noToday;

const OrgContext = createContext<Team[]>(seedTeams);
const useTeams = () => useContext(OrgContext);

/** Merge a person's overlapping tasks into continuous busy stretches. */
function busyRuns(person: Person) {
  const busy = Array.from({ length: 48 }, (_, week) => person.tasks.some((task) => week >= task.start && week < task.start + task.duration));
  const runs: { start: number; duration: number }[] = [];
  let week = 0;
  while (week < 48) {
    if (!busy[week]) { week += 1; continue; }
    const start = week;
    while (week < 48 && busy[week]) week += 1;
    runs.push({ start, duration: week - start });
  }
  return runs;
}

function TeamBadge({ team }: { team: Team }) {
  return <span className="team-dot" style={{ '--team': team.color } as CSSProperties}>{team.mark}</span>;
}

function AppHeader({ user, signOutHref, onHome, onHandover, onSearch, onManageMembers, compact = false, handoverActive = false }: { user: SessionUser; signOutHref: string; onHome: () => void; onHandover: () => void; onSearch: () => void; onManageMembers: () => void; compact?: boolean; handoverActive?: boolean }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const displayName = user.displayName || user.email.split('@')[0];
  return (
    <header className={`topbar ${compact ? 'compact' : ''}`}>
      <button className="brand" type="button" onClick={onHome} aria-label="국제처 업무 캘린더 홈">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span><strong>국제처 업무 캘린더</strong><small>GLOBAL AFFAIRS WORKSPACE</small></span>
      </button>
      <div className="topbar-actions">
        <button className={`handover-link ${handoverActive ? 'active' : ''}`} type="button" onClick={onHandover}><span aria-hidden="true">↗</span><b>인수인계 작성</b></button>
        <button className="search-button" type="button" onClick={onSearch} aria-label="통합 검색"><span aria-hidden="true">⌕</span><span>업무 또는 담당자 검색</span><kbd>⌘ K</kbd></button>
        <div className="profile-wrap">
          <button className="profile" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
            <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{displayName}</strong><small>국제처 · {user.role === 'admin' ? '관리자' : '파트원'}</small></span><span className="chevron" aria-hidden="true">⌄</span>
          </button>
          {profileOpen && <div className="profile-menu"><div><b>{displayName}</b><span>{user.email}</span></div>{user.role === 'admin' && <button className="manage-members-button" type="button" onClick={() => { setProfileOpen(false); onManageMembers(); }}><span aria-hidden="true">⚙</span> 파트원 관리</button>}<a className="logout-button" href={signOutHref}>로그아웃</a></div>}
        </div>
      </div>
    </header>
  );
}

function Landing({ onOpen }: { onOpen: (id: string) => void }) {
  const teams = useTeams();
  const allPeople = teams.flatMap((team) => team.people.map((person) => ({ team, person })));
  const weekLoad = Array.from({ length: 48 }, (_, week) =>
    allPeople.filter(({ person }) => person.tasks.some((task) => week >= task.start && week < task.start + task.duration)).length);
  const peakLoad = Math.max(1, ...weekLoad);
  const spaces = [
    { id: 'all', eyebrow: 'ALL PARTS', title: '국제처 전체', description: `${teams.length}개 파트의 업무 밀도와 연간 일정을 한눈에 살펴보세요.`, count: `${allPeople.length}명`, accent: '#e0a94e', mark: 'HQ' },
    ...teams.map((team) => ({ id: team.id, eyebrow: team.english, title: team.title, description: team.description, count: `${team.people.length}명`, accent: team.color, mark: team.mark })),
  ];
  return <>
    <section className="hero" id="top">
      <div className="hero-copy"><div className="semester-pill"><span /> 2026학년도 업무 캘린더</div><p className="kicker eyebrow">WORK CONTINUITY, MADE CLEAR</p><h1>이어지는 업무,<br /><em>한눈에 보이는 흐름.</em></h1><p className="hero-description">국제처 구성원의 연간 업무를 한곳에서 확인하고,<br className="desktop-break" /> 빈틈없는 인수인계를 시작하세요.</p><div className="hero-summary"><div><strong>{teams.length}</strong><span>운영 파트</span></div><i /><div><strong>{allPeople.length}</strong><span>담당자</span></div><i /><div><strong>52</strong><span>주간 흐름</span></div></div></div>
      <div className="hero-visual" aria-hidden="true">
        <div className="dial">
          <div className="dial-ring" />
          <div className="dial-ring inner" />
          <div className="dial-ticks">{weekLoad.map((load, week) => {
            const ratio = load / peakLoad;
            return <i key={week} style={{ '--i': week, '--len': `${8 + ratio * 23}px`, '--tick': load === 0 ? 'rgba(23,26,31,.1)' : ratio === 1 ? '#c9922f' : `rgba(20,29,43,${(0.22 + ratio * 0.58).toFixed(2)})` } as CSSProperties} />;
          })}</div>
          <div className="dial-core"><span>2026</span><strong>WORK<br />FLOW</strong><small>MAR — FEB</small></div>
        </div>
        <div className="orbital-card card-a"><b>03</b><span>학기 시작</span></div>
        <div className="orbital-card card-b"><b>08</b><span>집중 업무</span></div>
        <div className="orbital-card card-c"><b>12</b><span>입학 전형</span></div>
      </div>
    </section>
    <section className="spaces-section" aria-labelledby="spaces-title"><div className="section-heading"><div><p>SELECT WORKSPACE</p><h2 id="spaces-title">어디서 시작할까요?</h2></div><p className="section-note">파트를 선택하면 해당 파트의 연간 업무 흐름을 볼 수 있습니다.</p></div><div className="spaces-grid">{spaces.map((space, index) => <button className={`space-card ${space.id === 'all' ? 'featured' : ''}`} style={{ '--accent': space.accent } as CSSProperties} key={space.id} type="button" onClick={() => onOpen(space.id)}><div className="space-card-top"><span className="card-mark">{space.mark}</span><span className="card-arrow">↗</span></div><div className="space-card-copy"><p>{space.eyebrow}</p><h3>{space.title}</h3><span>{space.description}</span></div><div className="space-card-footer"><span>{space.id === 'all' ? '전체 구성원' : '담당자'}</span><strong>{space.count}</strong><span className="mini-bars" aria-hidden="true">{[0,1,2,3].map((bar) => <i key={bar} className={`b${(bar + index) % 4}`} />)}</span></div></button>)}</div></section>
    <footer><span>© 2026 GLOBAL AFFAIRS OFFICE</span><span>업무가 사람을 따라 자연스럽게 이어지도록.</span></footer>
  </>;
}

function CalendarHeader({ label = '2026. 03 — 2027. 02' }: { label?: string }) {
  return <div className="calendar-tools"><button type="button" aria-label="이전 연도">‹</button><strong>{label}</strong><button type="button" aria-label="다음 연도">›</button><span className="today-chip">TODAY</span></div>;
}

/** 48 numbered cells (1·2·3·4 per month) forming the week ruler of one row. */
function WeekGrid() {
  return <>{Array.from({ length: 48 }, (_, index) => <i className={`week-cell ${index % 4 === 0 ? 'month-start' : ''}`} key={index}>{index % 4 + 1}</i>)}</>;
}

/** Wraps the header + rows so the this-week column can run through all of them at once. */
function CalendarBody({ children }: { children: ReactNode }) {
  const { week } = useToday();
  return <div className="calendar-body">
    {children}
    {week !== null && <span className="today-column" style={{ '--start': week } as CSSProperties} />}
  </div>;
}

function WeekHeader({ lead }: { lead: string }) {
  return <div className="month-grid">
    <div className="grid-lead">{lead}</div>
    <div className="month-head">
      <div className="month-labels">{months.map((month) => <div className="month-label" key={month}>{month}</div>)}</div>
    </div>
  </div>;
}

function BusyCells({ person, color, onPerson }: { person: Person; color: string; onPerson?: () => void }) {
  return <div className="person-week-row">
    <button className="person-cell" type="button" onClick={onPerson}><span className="person-avatar" style={{ background: color }}>{person.initial}</span><span><b>{person.name}</b><small>{person.role}</small></span><i>›</i></button>
    <div className="task-timeline"><WeekGrid />{busyRuns(person).map((run) => <span className="load-bar" key={run.start} style={{ '--start': run.start, '--duration': run.duration, background: color } as CSSProperties} title={`${months[Math.floor(run.start / 4)]}부터 ${run.duration}주 연속 업무`} />)}</div>
  </div>;
}

function WorkspaceHead({ eyebrow, title, description, onHome, tools = true }: { eyebrow: string; title: string; description: string; onHome: () => void; tools?: boolean }) {
  return <div className="workspace-head"><div><button type="button" onClick={onHome}>홈</button><span>/</span><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>{tools && <CalendarHeader />}</div>;
}

function AllTeams({ onHome, onTeam, onPerson }: { onHome: () => void; onTeam: (id: string) => void; onPerson: (teamId: string, personId: string) => void }) {
  const teams = useTeams();
  const memberCount = teams.reduce((sum, team) => sum + team.people.length, 0);
  return <main className="workspace-page">
    <WorkspaceHead eyebrow="ALL PARTS" title="국제처 전체 업무 흐름" description={`${memberCount}명의 연간 업무 밀도를 주 단위로 한눈에 확인하세요.`} onHome={onHome} />
    <div className="legend-row"><span><i className="legend-empty" />여유</span>{teams.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.title}</span>)}<span><i className="legend-today" />이번 주</span><small>각 칸은 1주를 의미합니다.</small></div>
    <div className="overview-layout">
      <aside className="org-rail"><div className="org-emblem"><span>국제처</span><small>GLOBAL<br />AFFAIRS</small></div><div className="org-line" /><p>{teams.length}개 파트</p><b>{memberCount}</b><span>MEMBERS</span></aside>
      <section className="calendar-card overview-calendar"><CalendarBody><WeekHeader lead="파트 / 담당자" />
        {teams.map((team) => <div className="overview-team" key={team.id} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
          <button className="team-strip" type="button" onClick={() => onTeam(team.id)}><TeamBadge team={team} /><span><b>{team.title}</b><small>{team.english}</small></span><em>파트로 보기</em><i>↗</i></button>
          {team.people.map((person) => <BusyCells key={person.id} person={person} color={team.color} onPerson={() => onPerson(team.id, person.id)} />)}
        </div>)}
      </CalendarBody></section>
    </div>
  </main>;
}

function TaskRow({ person, team, onPerson, onTask }: { person: Person; team: Team; onPerson: () => void; onTask: (task: Task, person: Person) => void }) {
  return <div className="task-person-row"><button className="team-person-card" type="button" onClick={onPerson}><span className="person-avatar large" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>{person.role}</small></span><i>›</i></button><div className="task-timeline"><WeekGrid />{person.tasks.map((task) => <button className={`task-bar ${task.movedFrom !== undefined ? 'is-moved' : ''}`} key={`${task.title}-${task.start}`} style={{ '--start': task.start, '--duration': task.duration, '--team': team.color } as CSSProperties} type="button" onClick={() => onTask(task, person)} title={task.movedFrom !== undefined ? `${task.title} · ${weekLabel(task.movedFrom)}에서 변경됨` : task.title}>{task.movedFrom !== undefined && <i className="moved-flag" aria-hidden="true">↻</i>}<b>{task.title}</b>{task.duration >= 4 && <span>{months[Math.floor(task.start / 4)]} · {task.duration}주</span>}</button>)}</div></div>;
}

function TeamView({ team, onHome, onAll, onTeam, onPerson, onTask }: { team: Team; onHome: () => void; onAll: () => void; onTeam: (id: string) => void; onPerson: (id: string) => void; onTask: (task: Task, person: Person) => void }) {
  const teams = useTeams();
  const busyWeeks = new Set(team.people.flatMap((person) => person.tasks.flatMap((task) => Array.from({ length: task.duration }, (_, i) => task.start + i)))).size;
  return <main className="workspace-page team-page" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
    <WorkspaceHead eyebrow={team.english} title={team.title} description={team.description} onHome={onHome} />
    <nav className="team-switcher" aria-label="파트 전환"><button type="button" onClick={onAll}>전체</button>{teams.map((item) => <button type="button" className={item.id === team.id ? 'active' : ''} onClick={() => onTeam(item.id)} key={item.id}><i style={{ background: item.color }} />{item.short}</button>)}</nav>
    <section className="team-summary"><div className="team-summary-main"><TeamBadge team={team} /><span><small>PART WORKLOAD</small><strong>{team.title}</strong></span></div><div><strong>{team.people.length}</strong><span>담당자</span></div><div><strong>{team.people.reduce((sum, p) => sum + p.tasks.length, 0)}</strong><span>주요 업무</span></div><div><strong>{busyWeeks}</strong><span>집중 주간</span></div><p><i /> 색상 막대를 누르면 업무 설명을 볼 수 있습니다.</p></section>
    <section className="calendar-card team-calendar"><CalendarBody><WeekHeader lead="담당자 / 역할" />{team.people.map((person) => <TaskRow key={person.id} person={person} team={team} onPerson={() => onPerson(person.id)} onTask={onTask} />)}</CalendarBody></section>
    <section className="handover-note"><span>HANDOVER NOTE</span><p><b>파트 인수인계 포인트</b> 업무 막대가 겹치는 시기는 파트 전체의 업무가 집중되는 구간입니다. 해당 담당자를 눌러 세부 일정과 준비사항을 확인하세요.</p><button type="button">인수인계 메모 보기 <i>→</i></button></section>
  </main>;
}

function AnnualPersonCalendar({ person, team, monthIndex, onSelectMonth }: { person: Person; team: Team; monthIndex: number; onSelectMonth: (month: number) => void }) {
  return <section className="person-annual calendar-card"><div className="person-calendar-title"><div><small>ANNUAL FLOW</small><h2>연간 일정</h2></div><CalendarHeader /></div><CalendarBody><WeekHeader lead="연간 주요 업무" /><div className="person-year-track"><div className="year-track-lead"><span className="person-avatar" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>총 {person.tasks.length}개 주요 업무</small></span></div><div className="task-timeline large-track"><WeekGrid />{person.tasks.map((task) => {
    const taskMonth = Math.floor(task.start / 4);
    return <button className={`task-bar ${taskMonth === monthIndex ? 'is-active' : ''} ${task.movedFrom !== undefined ? 'is-moved' : ''}`} key={task.title} style={{ '--start': task.start, '--duration': task.duration, '--team': team.color } as CSSProperties} type="button" onClick={() => onSelectMonth(taskMonth)} title={`${task.title} · 누르면 ${months[taskMonth]} 월간 일정으로 이동합니다${task.movedFrom !== undefined ? ` (${weekLabel(task.movedFrom)}에서 변경됨)` : ''}`}>{task.movedFrom !== undefined && <i className="moved-flag" aria-hidden="true">↻</i>}<b>{task.title}</b>{task.duration >= 4 && <span>{months[taskMonth]} · {task.duration}주</span>}</button>;
  })}</div></div></CalendarBody></section>;
}

function getCalendarDays(monthIndex: number) {
  const year = monthIndex < 10 ? 2026 : 2027;
  const realMonth = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;
  const first = new Date(year, realMonth - 1, 1).getDay();
  const count = new Date(year, realMonth, 0).getDate();
  return { year, realMonth, cells: [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[] };
}

function MonthCalendar({ person, team, monthIndex, setMonthIndex, onTask }: { person: Person; team: Team; monthIndex: number; setMonthIndex: Dispatch<SetStateAction<number>>; onTask: (task: Task, person: Person) => void }) {
  const today = useToday();
  const calendar = getCalendarDays(monthIndex);
  const monthTasks = person.tasks.filter((task) => Math.floor(task.start / 4) <= monthIndex && Math.floor((task.start + task.duration - 1) / 4) >= monthIndex);
  const taskDays = monthTasks.map((task, index) => ({ task, day: Math.min(27, 3 + (task.start % 4) * 7 + index * 2) }));
  return <section className="month-section"><div className="person-calendar-title"><div><small>MONTHLY DETAIL</small><h2>월간 일정</h2></div><div className="month-nav"><button type="button" onClick={() => setMonthIndex((current) => (current + 11) % 12)}>‹</button><strong>{calendar.year}. {String(calendar.realMonth).padStart(2, '0')}</strong><button type="button" onClick={() => setMonthIndex((current) => (current + 1) % 12)}>›</button></div></div><div className="monthly-layout"><div className="monthly-calendar"><div className="weekday-row">{['일','월','화','수','목','금','토'].map((day) => <span key={day}>{day}</span>)}</div><div className="date-grid">{calendar.cells.map((day, index) => <div className={`date-cell ${day !== null && day === today.day && monthIndex === today.month ? 'today' : ''}`} key={`${day}-${index}`}>{day && <><span>{day}</span>{taskDays.filter((entry) => day >= entry.day && day < entry.day + Math.max(2, Math.min(5, entry.task.duration))).map((entry) => <button style={{ background: team.soft, color: team.color, borderColor: team.color }} type="button" onClick={() => onTask(entry.task, person)} key={entry.task.title}>{entry.task.title}</button>)}</>}</div>)}</div></div><aside className="month-agenda"><div><small>{months[monthIndex].replace('월','')}</small><span>MONTH</span></div><h3>{months[monthIndex]} 주요 일정</h3>{monthTasks.length ? monthTasks.map((task) => <button type="button" onClick={() => onTask(task, person)} key={task.title}><i style={{ background: team.color }} /><span><b>{task.title}{task.movedFrom !== undefined && <mark>일정 변경</mark>}</b><small>{task.note}</small></span><em>›</em></button>) : <p className="empty-agenda">등록된 집중 업무가 없습니다.<br />정기 업무를 진행하는 기간입니다.</p>}<div className="agenda-tip">일정 막대를 누르면 상세 메모를 확인하고, 사유와 함께 일정을 미룰 수 있어요.</div></aside></div></section>;
}

function PersonView({ team, person, onHome, onTeam, onTask, onCalendarCheck }: { team: Team; person: Person; onHome: () => void; onTeam: () => void; onTask: (task: Task, person: Person) => void; onCalendarCheck: () => void }) {
  const [monthIndex, setMonthIndex] = useState(0);
  return <main className="workspace-page person-page" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
    <div className="person-hero"><div className="person-breadcrumb"><button type="button" onClick={onHome}>홈</button><span>/</span><button type="button" onClick={onTeam}>{team.title}</button><span>/</span><small>{person.name}</small></div><div className="person-topline"><div className="person-identity"><span className="person-avatar xlarge" style={{ background: team.color }}>{person.initial}</span><div><span className="role-pill" style={{ color: team.color, background: team.soft }}>{person.role}</span><h1>{person.name} <small>담당자</small></h1><p>{team.title} · 2026학년도 업무 캘린더</p></div></div><div className="person-stats"><div><small>주요 업무</small><strong>{person.tasks.length}</strong><span>건</span></div><div><small>집중 업무기간</small><strong>{person.tasks.reduce((sum, task) => sum + task.duration, 0)}</strong><span>주</span></div><div><small>다음 일정</small><strong>{months[Math.floor(person.tasks[0].start / 4)]}</strong><span>{person.tasks[0].title}</span></div></div></div></div>
    <div className="cal-check-cta">
      <span className="cal-check-spark" aria-hidden="true">↻</span>
      <div><b>학사일정 기준 일정 점검</b><p>다음 학년도 학사일정과 비교해 옮겨야 할 업무와 그 시기를 제안합니다.</p></div>
      <button type="button" onClick={onCalendarCheck}>일정 점검</button>
    </div>
    <AnnualPersonCalendar person={person} team={team} monthIndex={monthIndex} onSelectMonth={setMonthIndex} />
    <MonthCalendar person={person} team={team} monthIndex={monthIndex} setMonthIndex={setMonthIndex} onTask={onTask} />
  </main>;
}

function RescheduleForm({ task, person, onReschedule }: { task: Task; person: Person; onReschedule: (personId: string, taskTitle: string, toStart: number, reason: string) => Promise<void> }) {
  const originalStart = task.movedFrom ?? task.start;
  const lastStart = WEEKS_IN_YEAR - task.duration;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(task.start);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const shift = (weeks: number) => setTarget((current) => Math.min(lastStart, Math.max(0, current + weeks)));
  const delta = target - task.start;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (delta === 0) { setError('현재와 다른 시점을 선택해 주세요.'); return; }
    if (reason.trim().length < 2) { setError('변경 사유를 입력해 주세요.'); return; }
    setError('');
    setSaving(true);
    try {
      await onReschedule(person.id, task.title, target, reason.trim());
      setReason('');
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '일정을 변경하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return <button className="reschedule-open" type="button" onClick={() => { setOpen(true); setError(''); }}><span aria-hidden="true">↻</span> 일정 변경 · 연기하기</button>;

  return <form className="reschedule-form" onSubmit={submit}>
    <div className="reschedule-head"><strong>일정 변경</strong><button type="button" onClick={() => { setOpen(false); setError(''); setTarget(task.start); }} disabled={saving}>취소</button></div>
    <div className="reschedule-quick">
      <button type="button" onClick={() => shift(-1)} disabled={saving || target === 0}>‹ 1주 당김</button>
      <button type="button" onClick={() => shift(1)} disabled={saving || target === lastStart}>1주 연기 ›</button>
      <button type="button" onClick={() => shift(2)} disabled={saving || target === lastStart}>2주 연기 ›</button>
      <button type="button" onClick={() => shift(4)} disabled={saving || target === lastStart}>4주 연기 ›</button>
      {task.movedFrom !== undefined && <button type="button" className="reschedule-reset" onClick={() => setTarget(originalStart)} disabled={saving || target === originalStart}>원래 일정으로</button>}
    </div>
    <label className="reschedule-field">
      <span>새 시작 시점</span>
      <select value={target} onChange={(event) => setTarget(Number(event.target.value))} disabled={saving}>
        {Array.from({ length: lastStart + 1 }, (_, week) => <option value={week} key={week}>{weekLabel(week)}{week === task.start ? ' · 현재' : ''}</option>)}
      </select>
    </label>
    <p className="reschedule-preview">
      <b>{weekLabel(task.start)}</b><i>→</i><b>{weekLabel(target)}</b>
      <span>{delta === 0 ? '변동 없음' : delta > 0 ? `${delta}주 연기` : `${-delta}주 앞당김`}</span>
    </p>
    <label className="reschedule-field">
      <span>변경 사유 <em>필수</em></span>
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={3} placeholder="예: 출입국관리사무소 단체접수 일정이 2주 순연되어 함께 조정" disabled={saving} />
    </label>
    {error && <span className="reschedule-error" role="alert">{error}</span>}
    <button className="modal-primary" type="submit" disabled={saving}>{saving ? '변경 중…' : '변경 사유와 함께 저장'}</button>
  </form>;
}

function formatChangedAt(value: string) {
  const changed = new Date(value);
  return Number.isNaN(changed.getTime()) ? value : `${changed.getFullYear()}. ${String(changed.getMonth() + 1).padStart(2, '0')}. ${String(changed.getDate()).padStart(2, '0')}`;
}

function RescheduleHistory({ history }: { history: ScheduleChange[] }) {
  if (!history.length) return null;
  return <div className="reschedule-history">
    <strong>일정 변경 이력 <span>{history.length}</span></strong>
    {[...history].reverse().map((change) => <div className="reschedule-history-row" key={change.changedAt + change.toStart}>
      <div><b>{weekLabel(change.fromStart)}</b><i>→</i><b>{weekLabel(change.toStart)}</b></div>
      <p>{change.reason}</p>
      <small>{change.changedBy} · {formatChangedAt(change.changedAt)}</small>
    </div>)}
  </div>;
}

function TaskModal({ task, person, team, history, onReschedule, onClose }: { task: Task; person: Person; team: Team; history: ScheduleChange[]; onReschedule: (personId: string, taskTitle: string, toStart: number, reason: string) => Promise<void>; onClose: () => void }) {
  const startMonth = months[Math.floor(task.start / 4)];
  const endMonth = months[Math.floor(Math.min(47, task.start + task.duration - 1) / 4)];
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-title" onMouseDown={(event) => event.stopPropagation()} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}><button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button><span className="modal-label">WORK DETAIL</span><div className="modal-team"><TeamBadge team={team} /><span><b>{team.title}</b><small>{person.name} · {person.role}</small></span></div><h2 id="task-title">{task.title}</h2><p>{task.note}</p>{task.movedFrom !== undefined && <p className="moved-note"><span>일정 변경됨</span> 최초 계획 {weekLabel(task.movedFrom)} → 현재 {weekLabel(task.start)}</p>}<div className="task-period"><div><small>시작</small><b>{startMonth} {task.start % 4 + 1}주</b></div><i>→</i><div><small>종료</small><b>{endMonth} {(task.start + task.duration - 1) % 4 + 1}주</b></div><span>{task.duration}주간</span></div><RescheduleForm key={task.start} task={task} person={person} onReschedule={onReschedule} /><RescheduleHistory history={history} /><div className="modal-checklist"><strong>인수인계 체크</strong><label><input type="checkbox" defaultChecked /> 전년도 결과보고서 확인</label><label><input type="checkbox" /> 관련 부서 일정 공유</label><label><input type="checkbox" /> 담당자 연락망 최신화</label></div><button className="modal-primary" type="button" onClick={onClose}>확인</button></section></div>;
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
      const data = await response.json() as AlignmentResponse & { error?: string };
      if (!response.ok) setError(data.error ?? '일정을 점검하지 못했습니다.');
      else setResult(data);
    } catch {
      setError('네트워크 오류로 점검하지 못했습니다.');
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

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="cal-check-modal" role="dialog" aria-modal="true" aria-labelledby="cal-check-title" onMouseDown={(event) => event.stopPropagation()} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
      <div className="cal-check-head">
        <span className="cal-check-spark" aria-hidden="true">↻</span>
        <div><span className="modal-label">ACADEMIC CALENDAR ALIGNMENT</span><h2 id="cal-check-title">학사일정 기준 일정 점검</h2><p>{person.name} 담당자의 연간 업무를 새 학년도 학사일정과 맞춰 봅니다. 조정하기 전까지 일정은 바뀌지 않습니다.</p></div>
      </div>
      <div className="cal-check-controls">
        <label><span>대상 학년도</span><select value={year} onChange={(event) => { setYear(Number(event.target.value)); setResult(null); setApplied([]); }} disabled={loading}>{targetYears.map((item) => <option value={item.year} key={item.year}>{baseAcademicYear}학년도 → {item.label}</option>)}</select></label>
        <button type="button" onClick={run} disabled={loading}>{loading ? '점검하는 중…' : result ? '다시 점검' : '일정 점검'}</button>
      </div>

      {loading && <div className="cal-check-loading"><i /><i /><i /><p>학사일정 변동과 업무 시기를 맞춰 보고 있습니다.</p></div>}
      {error && <p className="cal-check-error" role="alert">{error}</p>}

      {result && <>
        <div className="cal-check-shifts">
          <div className="cal-check-shifts-head"><b>학사일정 변동</b><small>{result.shifts.length}개 중 {moved.length}개 이동 · {result.fromYear}학년도 → {result.toYear}학년도</small></div>
          {moved.length ? <ul>{moved.map((item) => <li key={item.name}>
            <span className="cal-phase">{item.phase}</span>
            <b>{item.name}</b>
            <em>{item.fromLabel} <i aria-hidden="true">→</i> {item.toLabel}</em>
            <span className={`cal-shift ${item.shift > 0 ? 'late' : 'early'}`}>{shiftLabel(item.shift)}</span>
          </li>)}</ul> : <p className="cal-check-none">올해와 달라진 학사일정이 없습니다.</p>}
        </div>

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
                : <button type="button" onClick={() => apply(item)} disabled={busyId === item.id}>{busyId === item.id ? '반영하는 중…' : '이 일정으로 조정'}</button>}
            </div>}
          </article>;
        })}</div>
      </>}

      <div className="cal-check-actions">
        <p><span>ⓘ</span> 조정한 일정은 사유와 함께 업무의 변경 이력에 남습니다.</p>
        <button type="button" onClick={onClose}>닫기</button>
        <button type="button" onClick={applyAll} disabled={!result || remaining.length === 0 || Boolean(busyId)}>남은 {remaining.length}건 모두 조정</button>
      </div>
    </section>
  </div>;
}

function SearchModal({ onClose, onPerson }: { onClose: () => void; onPerson: (teamId: string, personId: string) => void }) {
  const teams = useTeams();
  const allPeople = useMemo(() => teams.flatMap((team) => team.people.map((person) => ({ team, person }))), [teams]);
  const [query, setQuery] = useState('');
  const results = useMemo(() => allPeople.filter(({ team, person }) => `${team.title} ${person.name} ${person.role} ${person.tasks.map((task) => task.title).join(' ')}`.includes(query.trim())).slice(0, 6), [allPeople, query]);
  return <div className="modal-backdrop search-backdrop" role="presentation" onMouseDown={onClose}><section className="search-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="search-input"><span>⌕</span><input autoFocus placeholder="담당자, 역할 또는 업무를 검색하세요" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>ESC</kbd></div><div className="search-results"><small>{query ? `검색 결과 ${results.length}건` : '빠른 탐색'}</small>{(query ? results : allPeople.slice(0, 4)).map(({ team, person }) => <button type="button" key={person.id} onClick={() => onPerson(team.id, person.id)}><span className="person-avatar" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>{team.title} · {person.role}</small></span><em>→</em></button>)}</div><p><kbd>↵</kbd> 열기 <kbd>ESC</kbd> 닫기</p></section></div>;
}

function MemberAdminModal({ removedMemberIds, loading, loadError, onRemove, onRestore, onClose }: { removedMemberIds: string[]; loading: boolean; loadError: string; onRemove: (personId: string, teamId: string) => Promise<void>; onRestore: (personId: string) => Promise<void>; onClose: () => void }) {
  const [confirmTarget, setConfirmTarget] = useState<{ team: Team; person: Person } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const totalMembers = seedTeams.reduce((sum, team) => sum + team.people.length, 0);
  const removedSet = useMemo(() => new Set(removedMemberIds), [removedMemberIds]);
  const removedPeople = seedTeams.flatMap((team) => team.people.filter((person) => removedSet.has(person.id)).map((person) => ({ team, person })));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pendingId) return;
      if (confirmTarget) setConfirmTarget(null);
      else onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirmTarget, onClose, pendingId]);

  const removeConfirmed = async () => {
    if (!confirmTarget) return;
    setActionError('');
    setPendingId(confirmTarget.person.id);
    try {
      await onRemove(confirmTarget.person.id, confirmTarget.team.id);
      setConfirmTarget(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '파트원을 방출하지 못했습니다.');
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

  return <div className="modal-backdrop member-admin-backdrop" role="presentation" onMouseDown={() => !pendingId && onClose()}>
    <section className="member-admin-modal" role="dialog" aria-modal="true" aria-labelledby="member-admin-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="member-admin-head"><div><span className="modal-label">ADMINISTRATION</span><h2 id="member-admin-title">파트원 관리</h2><p>현재 워크스페이스에 참여 중인 구성원을 관리합니다.</p></div><button type="button" onClick={onClose} disabled={Boolean(pendingId)} aria-label="파트원 관리 닫기">×</button></header>
      <div className="member-admin-summary"><div><strong>{totalMembers - removedMemberIds.length}</strong><span>활성 파트원</span></div><i /><div><strong>{removedMemberIds.length}</strong><span>방출된 파트원</span></div><p><span>관리자</span> 파트원 방출 권한이 있습니다.</p></div>
      {(loadError || actionError) && <div className="member-admin-error" role="alert">{actionError || loadError}</div>}
      <div className="member-admin-content">
        {loading ? <div className="member-admin-loading">파트원 정보를 불러오고 있습니다.</div> : seedTeams.map((team) => {
          const activePeople = team.people.filter((person) => !removedSet.has(person.id));
          return <section className="member-team-group" key={team.id} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}><div className="member-team-title"><span><i />{team.title}</span><small>{activePeople.length}명</small></div>{activePeople.length ? activePeople.map((person) => <div className="member-admin-row" key={person.id}><span className="person-avatar" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>{person.role}</small></span><button type="button" onClick={() => setConfirmTarget({ team, person })} disabled={Boolean(pendingId)}>파트에서 방출</button></div>) : <p className="member-team-empty">현재 소속된 파트원이 없습니다.</p>}</section>;
        })}
        {removedPeople.length > 0 && <section className="removed-members"><div className="removed-members-title"><span>방출된 파트원</span><small>필요하면 다시 복구할 수 있습니다.</small></div>{removedPeople.map(({ team, person }) => <div className="member-admin-row removed" key={person.id}><span className="person-avatar" style={{ background: '#9aa1aa' }}>{person.initial}</span><span><b>{person.name}</b><small>{team.title} · {person.role}</small></span><button type="button" onClick={() => restore(person.id)} disabled={Boolean(pendingId)}>{pendingId === person.id ? '복구 중…' : '파트원 복구'}</button></div>)}</section>}
      </div>
      <footer className="member-admin-footer"><span>방출된 파트원은 업무 화면과 검색 결과에서 즉시 제외됩니다.</span><button type="button" onClick={onClose} disabled={Boolean(pendingId)}>완료</button></footer>
      {confirmTarget && <div className="member-confirm-layer"><div className="member-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="member-confirm-title"><span className="member-confirm-icon">!</span><small>{confirmTarget.team.title}</small><h3 id="member-confirm-title">{confirmTarget.person.name} 님을 방출할까요?</h3><p>해당 파트원의 업무 일정과 담당자 페이지가 워크스페이스에서 숨겨집니다. 이후 파트원 관리에서 복구할 수 있습니다.</p><div>{actionError && <span role="alert">{actionError}</span>}<button type="button" onClick={() => { setConfirmTarget(null); setActionError(''); }} disabled={Boolean(pendingId)}>취소</button><button type="button" className="danger" onClick={removeConfirmed} disabled={Boolean(pendingId)}>{pendingId ? '방출 중…' : '파트에서 방출'}</button></div></div></div>}
    </section>
  </div>;
}

export default function WorkspaceClient({ currentUser, signOutHref }: { currentUser: SessionUser; signOutHref: string }) {
  const [view, setView] = useState<View>({ type: 'home' });
  const today = useSyncExternalStore(subscribeToday, readToday, readServerToday);
  const [searchOpen, setSearchOpen] = useState(false);
  const [memberAdminOpen, setMemberAdminOpen] = useState(false);
  const [removedMemberIds, setRemovedMemberIds] = useState<string[]>([]);
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

  const teams = useMemo(() => seedTeams.map((team) => ({
    ...team,
    people: team.people.filter((person) => !removedMemberIds.includes(person.id)).map((person) => ({
      ...person,
      tasks: person.tasks.map((task) => {
        const trail = historyByTask.get(taskKey(person.id, task.title));
        const current = trail?.[trail.length - 1]?.toStart;
        return current === undefined || current === task.start ? task : { ...task, start: current, movedFrom: task.start };
      }).sort((first, second) => first.start - second.start),
    })),
  })), [removedMemberIds, historyByTask]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/members', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('파트원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return response.json() as Promise<{ removedMemberIds: string[] }>;
      })
      .then((data) => setRemovedMemberIds(data.removedMemberIds))
      .catch((error) => { if (error instanceof Error && error.name !== 'AbortError') setMembersLoadError(error.message); })
      .finally(() => setMembersLoading(false));
    return () => controller.abort();
  }, []);

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
    if (!response.ok) throw new Error('파트원을 방출하지 못했습니다. 잠시 후 다시 시도해 주세요.');
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
    <AppHeader user={currentUser} signOutHref={signOutHref} compact={view.type !== 'home'} handoverActive={view.type === 'handover'} onHome={() => setView({ type: 'home' })} onHandover={() => setView({ type: 'handover' })} onSearch={() => setSearchOpen(true)} onManageMembers={() => setMemberAdminOpen(true)} />
    {view.type === 'home' && <Landing onOpen={(id) => id === 'all' ? setView({ type: 'all' }) : openTeam(id)} />}
    {view.type === 'handover' && <HandoverWorkspace onHome={() => setView({ type: 'home' })} />}
    {view.type === 'all' && <AllTeams onHome={() => setView({ type: 'home' })} onTeam={openTeam} onPerson={openPerson} />}
    {view.type === 'team' && selectedTeam && <TeamView team={selectedTeam} onHome={() => setView({ type: 'home' })} onAll={() => setView({ type: 'all' })} onTeam={openTeam} onPerson={(id) => openPerson(selectedTeam.id, id)} onTask={showTask} />}
    {view.type === 'person' && selectedTeam && selectedPerson && <PersonView team={selectedTeam} person={selectedPerson} onHome={() => setView({ type: 'home' })} onTeam={() => openTeam(selectedTeam.id)} onTask={showTask} onCalendarCheck={() => setCalendarCheckId(selectedPerson.id)} />}
    {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onPerson={(teamId, personId) => { openPerson(teamId, personId); setSearchOpen(false); }} />}
    {memberAdminOpen && currentUser.role === 'admin' && <MemberAdminModal removedMemberIds={removedMemberIds} loading={membersLoading} loadError={membersLoadError} onRemove={removeMember} onRestore={restoreMember} onClose={() => setMemberAdminOpen(false)} />}
    {calendarCheckId && selectedTeam && selectedPerson && selectedPerson.id === calendarCheckId && <CalendarCheckModal person={selectedPerson} team={selectedTeam} onReschedule={rescheduleTask} onClose={() => setCalendarCheckId(null)} />}
    {taskDetail && <TaskModal {...taskDetail} history={historyByTask.get(taskKey(taskDetail.person.id, taskDetail.task.title)) ?? []} onReschedule={rescheduleTask} onClose={() => setTaskFocus(null)} />}
  </div></TodayContext.Provider></OrgContext.Provider>;
}
