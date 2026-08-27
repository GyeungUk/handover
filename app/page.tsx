'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import HandoverWorkspace from './HandoverWorkspace';

type Task = { title: string; start: number; duration: number; note: string };
type Person = { id: string; name: string; role: string; initial: string; tasks: Task[] };
type Team = { id: string; title: string; short: string; english: string; description: string; color: string; soft: string; mark: string; people: Person[] };
type View = { type: 'home' } | { type: 'handover' } | { type: 'all' } | { type: 'team'; teamId: string } | { type: 'person'; teamId: string; personId: string };

const months = ['3월','4월','5월','6월','7월','8월','9월','10월','11월','12월','1월','2월'];

type Today = { week: number | null; month: number | null; day: number | null };
const TodayContext = createContext<Today>({ week: null, month: null, day: null });
const useToday = () => useContext(TodayContext);

const noToday: Today = { week: null, month: null, day: null };

/** Locate a real date inside the 2026.03 — 2027.02 academic year (48 weeks, 4 per month). */
function locateToday(now: Date): Today {
  if (now < new Date(2026, 2, 1) || now >= new Date(2027, 2, 1)) return noToday;
  const month = (now.getMonth() + 10) % 12;
  const weekOfMonth = Math.min(3, Math.floor((now.getDate() - 1) / 7));
  return { week: month * 4 + weekOfMonth, month, day: now.getDate() };
}

/* the marker resolves on the client only, so the server and client first paint match */
let clientToday: Today | null = null;
const subscribeToday = () => () => {};
const readToday = () => (clientToday ??= locateToday(new Date()));
const readServerToday = () => noToday;

const seedTeams: Team[] = [
  {
    id: 'management', title: '유학생관리팀', short: '유학생관리', english: 'STUDENT CARE', mark: '01', color: '#b8544c', soft: '#f7ebe9',
    description: '유학생의 체류부터 학사·생활까지 안정적인 캠퍼스 생활을 지원합니다.',
    people: [
      { id: 'minseo', name: '박민서', role: '체류·비자 관리', initial: '박', tasks: [
        { title: '신입생 체류자격 변경', start: 0, duration: 4, note: '신입 외국인 학생 D-2 체류자격 변경 서류 접수 및 검토' },
        { title: '외국인등록 단체접수', start: 5, duration: 3, note: '출입국관리사무소 단체 접수 및 학생별 보완 안내' },
        { title: '비자 연장 집중기간', start: 21, duration: 5, note: '재학생 체류기간 만료 대상자 안내와 서류 검토' },
        { title: '동계 체류 현황 점검', start: 39, duration: 3, note: '방학 중 출국 및 체류지 변경 현황 확인' },
      ]},
      { id: 'jiwoo', name: '최지우', role: '생활·상담 지원', initial: '최', tasks: [
        { title: '신입생 오리엔테이션', start: 0, duration: 2, note: '캠퍼스 생활, 보험, 주요 행정 절차 안내' },
        { title: '상반기 정기상담', start: 8, duration: 4, note: '학업·생활 적응 확인 및 고위험군 연계 상담' },
        { title: '문화체험 프로그램', start: 25, duration: 3, note: '가을학기 유학생 지역문화 체험 운영' },
        { title: '동계 생활지원', start: 43, duration: 3, note: '겨울방학 잔류 학생 대상 생활지원 안내' },
      ]},
      { id: 'dohyun', name: '이도현', role: '학사·장학 지원', initial: '이', tasks: [
        { title: '외국인 장학 선발', start: 4, duration: 4, note: '성적 및 한국어능력 기준 검토, 장학생 선발' },
        { title: '학사경고자 집중관리', start: 13, duration: 3, note: '학사경고 유학생 면담 및 학습지원 연계' },
        { title: '2학기 장학 심사', start: 22, duration: 4, note: '2학기 외국인 재학생 장학금 심사' },
        { title: '졸업예정자 점검', start: 40, duration: 4, note: '졸업요건, 비자변경 및 귀국 관련 안내' },
      ]},
    ],
  },
  {
    id: 'recruitment', title: '유학생유치팀', short: '유학생유치', english: 'GLOBAL ADMISSIONS', mark: '02', color: '#b07d34', soft: '#f8f0e2',
    description: '전 세계의 우수한 학생과 대학을 연결하고 입학 전 과정을 설계합니다.',
    people: [
      { id: 'seoyeon', name: '김서연', role: '입학전형 기획', initial: '김', tasks: [
        { title: '후기전형 모집요강', start: 1, duration: 4, note: '후기 외국인 특별전형 모집요강 확정 및 공고' },
        { title: '서류·면접 심사', start: 8, duration: 5, note: '지원자 자격 검토와 학과별 온라인 면접 운영' },
        { title: '전기전형 기획', start: 24, duration: 4, note: '다음 학년도 전기전형 일정 및 선발 계획 수립' },
        { title: '합격자 등록', start: 35, duration: 3, note: '합격자 등록 확인과 표준입학허가서 발급' },
      ]},
      { id: 'junho', name: '정준호', role: '해외홍보·박람회', initial: '정', tasks: [
        { title: '동남아 유학박람회', start: 6, duration: 3, note: '베트남·태국 현지 박람회 및 고교 설명회 참가' },
        { title: '글로벌 홍보 콘텐츠', start: 14, duration: 4, note: '다국어 입학 홍보 영상과 디지털 캠페인 제작' },
        { title: '중앙아시아 출장', start: 27, duration: 3, note: '우즈베키스탄·카자흐스탄 현지 유치 활동' },
        { title: '온라인 입학설명회', start: 38, duration: 3, note: '국가별 온라인 입학설명회 진행' },
      ]},
      { id: 'eunchae', name: '한은채', role: '지원자·기관 관리', initial: '한', tasks: [
        { title: '지원자 문의 집중응대', start: 4, duration: 5, note: '이메일·메신저 입학 문의 및 서류 사전검토' },
        { title: '에이전시 성과점검', start: 15, duration: 3, note: '해외 협력기관별 지원·등록 성과 분석' },
        { title: '지원서 접수 운영', start: 29, duration: 5, note: '온라인 원서접수 시스템 운영과 미비서류 안내' },
        { title: '신입생 입국 안내', start: 45, duration: 3, note: '입국, 기숙사 및 오리엔테이션 사전 안내' },
      ]},
    ],
  },
  {
    id: 'exchange', title: '교류팀', short: '교류', english: 'GLOBAL EXCHANGE', mark: '03', color: '#3d6a92', soft: '#e9eff5',
    description: '협정대학 네트워크를 바탕으로 파견·초청 교류의 전 과정을 운영합니다.',
    people: [
      { id: 'yujin', name: '강유진', role: '파견 교환학생', initial: '강', tasks: [
        { title: '파견학생 출국 점검', start: 0, duration: 3, note: '보험, 수강계획, 안전교육 및 출국서류 최종 점검' },
        { title: '차기 파견자 선발', start: 10, duration: 5, note: '교환학생 지원 접수, 면접 및 대학 배정' },
        { title: '귀국보고회', start: 19, duration: 2, note: '귀국 학생 경험공유회 및 학점인정 안내' },
        { title: '상반기 파견 준비', start: 37, duration: 5, note: '협정대학 nomination과 출국 전 교육' },
      ]},
      { id: 'taeyang', name: '오태양', role: '초청 교환학생', initial: '오', tasks: [
        { title: '봄학기 버디 매칭', start: 0, duration: 3, note: '초청학생과 재학생 버디 선발 및 매칭' },
        { title: '수강변경 집중지원', start: 3, duration: 2, note: '교환학생 수강신청 변경 및 학과 협의' },
        { title: '가을학기 입국지원', start: 22, duration: 4, note: '공항 픽업, 기숙사 입사, 오리엔테이션 운영' },
        { title: '성적표 발송', start: 41, duration: 3, note: '수학 종료학생 성적표 검수 및 파트너대학 발송' },
      ]},
      { id: 'sujin', name: '배수진', role: '협정·의전', initial: '배', tasks: [
        { title: '협정 갱신 현황조사', start: 5, duration: 4, note: '만료 예정 협정 검토와 교류실적 확인' },
        { title: '해외대학 방문단', start: 14, duration: 3, note: '방문단 일정, 면담 및 캠퍼스 투어 의전' },
        { title: '글로벌 파트너 데이', start: 26, duration: 4, note: '해외 협정대학 대상 네트워킹 행사 운영' },
        { title: '연간 교류실적 보고', start: 42, duration: 4, note: '대학별 교류실적 취합과 차년도 계획 수립' },
      ]},
    ],
  },
  {
    id: 'language', title: '한국어교육원', short: '한국어교육원', english: 'KOREAN LANGUAGE', mark: '04', color: '#4c7f72', soft: '#e8f1ee',
    description: '한국어 정규과정과 문화 프로그램으로 학습자의 성장과 적응을 돕습니다.',
    people: [
      { id: 'hyejin', name: '윤혜진', role: '정규과정 운영', initial: '윤', tasks: [
        { title: '봄학기 개강', start: 0, duration: 4, note: '분반, 교재 배부, 강사 배정 및 개강 운영' },
        { title: '여름학기 등록', start: 9, duration: 4, note: '재등록·신규등록 접수와 분반시험 준비' },
        { title: '가을학기 운영', start: 22, duration: 5, note: '가을학기 개강 및 수업 운영 모니터링' },
        { title: '겨울학기 개강', start: 35, duration: 4, note: '겨울학기 수강생 등록 및 개강 준비' },
      ]},
      { id: 'seongmin', name: '임성민', role: '강사·교육과정', initial: '임', tasks: [
        { title: '강사 오리엔테이션', start: 0, duration: 2, note: '학사일정, 평가기준 및 수업운영 지침 안내' },
        { title: '중간평가 문항검토', start: 7, duration: 3, note: '급별 중간평가 문항 검수 및 인쇄' },
        { title: '교재개발 워크숍', start: 17, duration: 4, note: '수준별 자체 교재 개발 회의와 집필' },
        { title: '강사 재위촉 평가', start: 39, duration: 4, note: '수업평가 및 근무실적 기반 재위촉 심사' },
      ]},
      { id: 'nayeon', name: '송나연', role: '학생·문화지원', initial: '송', tasks: [
        { title: '신입생 생활안내', start: 0, duration: 3, note: '기숙사, 보험, 은행 및 휴대전화 개통 안내' },
        { title: '봄 문화체험', start: 10, duration: 2, note: '한국문화 체험학습 사전답사 및 행사 운영' },
        { title: '한국어 말하기 대회', start: 27, duration: 3, note: '참가 접수, 예선심사와 본선 행사 운영' },
        { title: '수료식·진급상담', start: 44, duration: 3, note: '수료식 운영과 다음 학기 진급 상담' },
      ]},
    ],
  },
];

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

function AppHeader({ onHome, onHandover, onSearch, onManageMembers, onLogout, compact = false, handoverActive = false }: { onHome: () => void; onHandover: () => void; onSearch: () => void; onManageMembers: () => void; onLogout: () => void; compact?: boolean; handoverActive?: boolean }) {
  const [profileOpen, setProfileOpen] = useState(false);
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
            <span className="avatar">김</span><span className="profile-copy"><strong>김지현</strong><small>국제처 · 관리자</small></span><span className="chevron" aria-hidden="true">⌄</span>
          </button>
          {profileOpen && <div className="profile-menu"><div><b>김지현</b><span>jihyun.kim@univ.ac.kr</span></div><button className="manage-members-button" type="button" onClick={() => { setProfileOpen(false); onManageMembers(); }}><span aria-hidden="true">⚙</span> 팀원 관리</button><button className="logout-button" type="button" onClick={onLogout}>로그아웃</button></div>}
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
    { id: 'all', eyebrow: 'ALL TEAMS', title: '국제팀 전체', description: `${teams.length}개 팀의 업무 밀도와 연간 일정을 한눈에 살펴보세요.`, count: `${allPeople.length}명`, accent: '#e0a94e', mark: 'HQ' },
    ...teams.map((team) => ({ id: team.id, eyebrow: team.english, title: team.title, description: team.description, count: `${team.people.length}명`, accent: team.color, mark: team.mark })),
  ];
  return <>
    <section className="hero" id="top">
      <div className="hero-copy"><div className="semester-pill"><span /> 2026학년도 업무 캘린더</div><p className="kicker eyebrow">WORK CONTINUITY, MADE CLEAR</p><h1>이어지는 업무,<br /><em>한눈에 보이는 흐름.</em></h1><p className="hero-description">국제처 구성원의 연간 업무를 한곳에서 확인하고,<br className="desktop-break" /> 빈틈없는 인수인계를 시작하세요.</p><div className="hero-summary"><div><strong>{teams.length}</strong><span>운영 팀</span></div><i /><div><strong>{allPeople.length}</strong><span>담당자</span></div><i /><div><strong>52</strong><span>주간 흐름</span></div></div></div>
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
    <section className="spaces-section" aria-labelledby="spaces-title"><div className="section-heading"><div><p>SELECT WORKSPACE</p><h2 id="spaces-title">어디서 시작할까요?</h2></div><p className="section-note">파트를 선택하면 해당 팀의 연간 업무 흐름을 볼 수 있습니다.</p></div><div className="spaces-grid">{spaces.map((space, index) => <button className={`space-card ${space.id === 'all' ? 'featured' : ''}`} style={{ '--accent': space.accent } as CSSProperties} key={space.id} type="button" onClick={() => onOpen(space.id)}><div className="space-card-top"><span className="card-mark">{space.mark}</span><span className="card-arrow">↗</span></div><div className="space-card-copy"><p>{space.eyebrow}</p><h3>{space.title}</h3><span>{space.description}</span></div><div className="space-card-footer"><span>{space.id === 'all' ? '전체 구성원' : '담당자'}</span><strong>{space.count}</strong><span className="mini-bars" aria-hidden="true">{[0,1,2,3].map((bar) => <i key={bar} className={`b${(bar + index) % 4}`} />)}</span></div></button>)}</div></section>
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
    <WorkspaceHead eyebrow="ALL TEAMS" title="국제팀 전체 업무 흐름" description={`${memberCount}명의 연간 업무 밀도를 주 단위로 한눈에 확인하세요.`} onHome={onHome} />
    <div className="legend-row"><span><i className="legend-empty" />여유</span>{teams.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.title}</span>)}<span><i className="legend-today" />이번 주</span><small>각 칸은 1주를 의미합니다.</small></div>
    <div className="overview-layout">
      <aside className="org-rail"><div className="org-emblem"><span>국제처</span><small>GLOBAL<br />AFFAIRS</small></div><div className="org-line" /><p>{teams.length}개 팀</p><b>{memberCount}</b><span>MEMBERS</span></aside>
      <section className="calendar-card overview-calendar"><CalendarBody><WeekHeader lead="팀 / 담당자" />
        {teams.map((team) => <div className="overview-team" key={team.id} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
          <button className="team-strip" type="button" onClick={() => onTeam(team.id)}><TeamBadge team={team} /><span><b>{team.title}</b><small>{team.english}</small></span><em>팀으로 보기</em><i>↗</i></button>
          {team.people.map((person) => <BusyCells key={person.id} person={person} color={team.color} onPerson={() => onPerson(team.id, person.id)} />)}
        </div>)}
      </CalendarBody></section>
    </div>
  </main>;
}

function TaskRow({ person, team, onPerson, onTask }: { person: Person; team: Team; onPerson: () => void; onTask: (task: Task, person: Person) => void }) {
  return <div className="task-person-row"><button className="team-person-card" type="button" onClick={onPerson}><span className="person-avatar large" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>{person.role}</small></span><i>›</i></button><div className="task-timeline"><WeekGrid />{person.tasks.map((task) => <button className="task-bar" key={`${task.title}-${task.start}`} style={{ '--start': task.start, '--duration': task.duration, '--team': team.color } as CSSProperties} type="button" onClick={() => onTask(task, person)} title={task.title}><b>{task.title}</b>{task.duration >= 4 && <span>{months[Math.floor(task.start / 4)]} · {task.duration}주</span>}</button>)}</div></div>;
}

function TeamView({ team, onHome, onAll, onTeam, onPerson, onTask }: { team: Team; onHome: () => void; onAll: () => void; onTeam: (id: string) => void; onPerson: (id: string) => void; onTask: (task: Task, person: Person) => void }) {
  const teams = useTeams();
  const busyWeeks = new Set(team.people.flatMap((person) => person.tasks.flatMap((task) => Array.from({ length: task.duration }, (_, i) => task.start + i)))).size;
  return <main className="workspace-page team-page" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
    <WorkspaceHead eyebrow={team.english} title={team.title} description={team.description} onHome={onHome} />
    <nav className="team-switcher" aria-label="팀 전환"><button type="button" onClick={onAll}>전체</button>{teams.map((item) => <button type="button" className={item.id === team.id ? 'active' : ''} onClick={() => onTeam(item.id)} key={item.id}><i style={{ background: item.color }} />{item.short}</button>)}</nav>
    <section className="team-summary"><div className="team-summary-main"><TeamBadge team={team} /><span><small>TEAM WORKLOAD</small><strong>{team.title}</strong></span></div><div><strong>{team.people.length}</strong><span>담당자</span></div><div><strong>{team.people.reduce((sum, p) => sum + p.tasks.length, 0)}</strong><span>주요 업무</span></div><div><strong>{busyWeeks}</strong><span>집중 주간</span></div><p><i /> 색상 막대를 누르면 업무 설명을 볼 수 있습니다.</p></section>
    <section className="calendar-card team-calendar"><CalendarBody><WeekHeader lead="담당자 / 역할" />{team.people.map((person) => <TaskRow key={person.id} person={person} team={team} onPerson={() => onPerson(person.id)} onTask={onTask} />)}</CalendarBody></section>
    <section className="handover-note"><span>HANDOVER NOTE</span><p><b>팀 인수인계 포인트</b> 업무 막대가 겹치는 시기는 팀 전체의 업무가 집중되는 구간입니다. 해당 담당자를 눌러 세부 일정과 준비사항을 확인하세요.</p><button type="button">인수인계 메모 보기 <i>→</i></button></section>
  </main>;
}

function AnnualPersonCalendar({ person, team, monthIndex, onSelectMonth }: { person: Person; team: Team; monthIndex: number; onSelectMonth: (month: number) => void }) {
  return <section className="person-annual calendar-card"><div className="person-calendar-title"><div><small>ANNUAL FLOW</small><h2>연간 일정</h2></div><CalendarHeader /></div><CalendarBody><WeekHeader lead="연간 주요 업무" /><div className="person-year-track"><div className="year-track-lead"><span className="person-avatar" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>총 {person.tasks.length}개 주요 업무</small></span></div><div className="task-timeline large-track"><WeekGrid />{person.tasks.map((task) => {
    const taskMonth = Math.floor(task.start / 4);
    return <button className={`task-bar ${taskMonth === monthIndex ? 'is-active' : ''}`} key={task.title} style={{ '--start': task.start, '--duration': task.duration, '--team': team.color } as CSSProperties} type="button" onClick={() => onSelectMonth(taskMonth)} title={`${task.title} · 누르면 ${months[taskMonth]} 월간 일정으로 이동합니다`}><b>{task.title}</b>{task.duration >= 4 && <span>{months[taskMonth]} · {task.duration}주</span>}</button>;
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
  return <section className="month-section"><div className="person-calendar-title"><div><small>MONTHLY DETAIL</small><h2>월간 일정</h2></div><div className="month-nav"><button type="button" onClick={() => setMonthIndex((current) => (current + 11) % 12)}>‹</button><strong>{calendar.year}. {String(calendar.realMonth).padStart(2, '0')}</strong><button type="button" onClick={() => setMonthIndex((current) => (current + 1) % 12)}>›</button></div></div><div className="monthly-layout"><div className="monthly-calendar"><div className="weekday-row">{['일','월','화','수','목','금','토'].map((day) => <span key={day}>{day}</span>)}</div><div className="date-grid">{calendar.cells.map((day, index) => <div className={`date-cell ${day !== null && day === today.day && monthIndex === today.month ? 'today' : ''}`} key={`${day}-${index}`}>{day && <><span>{day}</span>{taskDays.filter((entry) => day >= entry.day && day < entry.day + Math.max(2, Math.min(5, entry.task.duration))).map((entry) => <button style={{ background: team.soft, color: team.color, borderColor: team.color }} type="button" onClick={() => onTask(entry.task, person)} key={entry.task.title}>{entry.task.title}</button>)}</>}</div>)}</div></div><aside className="month-agenda"><div><small>{months[monthIndex].replace('월','')}</small><span>MONTH</span></div><h3>{months[monthIndex]} 주요 일정</h3>{monthTasks.length ? monthTasks.map((task) => <button type="button" onClick={() => onTask(task, person)} key={task.title}><i style={{ background: team.color }} /><span><b>{task.title}</b><small>{task.note}</small></span><em>›</em></button>) : <p className="empty-agenda">등록된 집중 업무가 없습니다.<br />정기 업무를 진행하는 기간입니다.</p>}<div className="agenda-tip">일정 막대를 누르면 상세 메모를 확인할 수 있어요.</div></aside></div></section>;
}

function PersonView({ team, person, onHome, onTeam, onTask }: { team: Team; person: Person; onHome: () => void; onTeam: () => void; onTask: (task: Task, person: Person) => void }) {
  const [monthIndex, setMonthIndex] = useState(0);
  return <main className="workspace-page person-page" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
    <div className="person-hero"><div className="person-breadcrumb"><button type="button" onClick={onHome}>홈</button><span>/</span><button type="button" onClick={onTeam}>{team.title}</button><span>/</span><small>{person.name}</small></div><div className="person-topline"><div className="person-identity"><span className="person-avatar xlarge" style={{ background: team.color }}>{person.initial}</span><div><span className="role-pill" style={{ color: team.color, background: team.soft }}>{person.role}</span><h1>{person.name} <small>담당자</small></h1><p>{team.title} · 2026학년도 업무 캘린더</p></div></div><div className="person-stats"><div><small>주요 업무</small><strong>{person.tasks.length}</strong><span>건</span></div><div><small>집중 업무기간</small><strong>{person.tasks.reduce((sum, task) => sum + task.duration, 0)}</strong><span>주</span></div><div><small>다음 일정</small><strong>{months[Math.floor(person.tasks[0].start / 4)]}</strong><span>{person.tasks[0].title}</span></div></div></div></div>
    <AnnualPersonCalendar person={person} team={team} monthIndex={monthIndex} onSelectMonth={setMonthIndex} />
    <MonthCalendar person={person} team={team} monthIndex={monthIndex} setMonthIndex={setMonthIndex} onTask={onTask} />
  </main>;
}

function TaskModal({ task, person, team, onClose }: { task: Task; person: Person; team: Team; onClose: () => void }) {
  const startMonth = months[Math.floor(task.start / 4)];
  const endMonth = months[Math.floor(Math.min(47, task.start + task.duration - 1) / 4)];
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-title" onMouseDown={(event) => event.stopPropagation()} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}><button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button><span className="modal-label">WORK DETAIL</span><div className="modal-team"><TeamBadge team={team} /><span><b>{team.title}</b><small>{person.name} · {person.role}</small></span></div><h2 id="task-title">{task.title}</h2><p>{task.note}</p><div className="task-period"><div><small>시작</small><b>{startMonth} {task.start % 4 + 1}주</b></div><i>→</i><div><small>종료</small><b>{endMonth} {(task.start + task.duration - 1) % 4 + 1}주</b></div><span>{task.duration}주간</span></div><div className="modal-checklist"><strong>인수인계 체크</strong><label><input type="checkbox" defaultChecked /> 전년도 결과보고서 확인</label><label><input type="checkbox" /> 관련 부서 일정 공유</label><label><input type="checkbox" /> 담당자 연락망 최신화</label></div><button className="modal-primary" type="button" onClick={onClose}>확인</button></section></div>;
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
      setActionError(error instanceof Error ? error.message : '팀원을 방출하지 못했습니다.');
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
      setActionError(error instanceof Error ? error.message : '팀원을 복구하지 못했습니다.');
    } finally {
      setPendingId(null);
    }
  };

  return <div className="modal-backdrop member-admin-backdrop" role="presentation" onMouseDown={() => !pendingId && onClose()}>
    <section className="member-admin-modal" role="dialog" aria-modal="true" aria-labelledby="member-admin-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="member-admin-head"><div><span className="modal-label">ADMINISTRATION</span><h2 id="member-admin-title">팀원 관리</h2><p>현재 워크스페이스에 참여 중인 구성원을 관리합니다.</p></div><button type="button" onClick={onClose} disabled={Boolean(pendingId)} aria-label="팀원 관리 닫기">×</button></header>
      <div className="member-admin-summary"><div><strong>{totalMembers - removedMemberIds.length}</strong><span>활성 팀원</span></div><i /><div><strong>{removedMemberIds.length}</strong><span>방출된 팀원</span></div><p><span>관리자</span> 팀원 방출 권한이 있습니다.</p></div>
      {(loadError || actionError) && <div className="member-admin-error" role="alert">{actionError || loadError}</div>}
      <div className="member-admin-content">
        {loading ? <div className="member-admin-loading">팀원 정보를 불러오고 있습니다.</div> : seedTeams.map((team) => {
          const activePeople = team.people.filter((person) => !removedSet.has(person.id));
          return <section className="member-team-group" key={team.id} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}><div className="member-team-title"><span><i />{team.title}</span><small>{activePeople.length}명</small></div>{activePeople.length ? activePeople.map((person) => <div className="member-admin-row" key={person.id}><span className="person-avatar" style={{ background: team.color }}>{person.initial}</span><span><b>{person.name}</b><small>{person.role}</small></span><button type="button" onClick={() => setConfirmTarget({ team, person })} disabled={Boolean(pendingId)}>팀에서 방출</button></div>) : <p className="member-team-empty">현재 소속된 팀원이 없습니다.</p>}</section>;
        })}
        {removedPeople.length > 0 && <section className="removed-members"><div className="removed-members-title"><span>방출된 팀원</span><small>필요하면 다시 복구할 수 있습니다.</small></div>{removedPeople.map(({ team, person }) => <div className="member-admin-row removed" key={person.id}><span className="person-avatar" style={{ background: '#9aa1aa' }}>{person.initial}</span><span><b>{person.name}</b><small>{team.title} · {person.role}</small></span><button type="button" onClick={() => restore(person.id)} disabled={Boolean(pendingId)}>{pendingId === person.id ? '복구 중…' : '팀원 복구'}</button></div>)}</section>}
      </div>
      <footer className="member-admin-footer"><span>방출된 팀원은 업무 화면과 검색 결과에서 즉시 제외됩니다.</span><button type="button" onClick={onClose} disabled={Boolean(pendingId)}>완료</button></footer>
      {confirmTarget && <div className="member-confirm-layer"><div className="member-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="member-confirm-title"><span className="member-confirm-icon">!</span><small>{confirmTarget.team.title}</small><h3 id="member-confirm-title">{confirmTarget.person.name} 님을 방출할까요?</h3><p>해당 팀원의 업무 일정과 담당자 페이지가 워크스페이스에서 숨겨집니다. 이후 팀원 관리에서 복구할 수 있습니다.</p><div>{actionError && <span role="alert">{actionError}</span>}<button type="button" onClick={() => { setConfirmTarget(null); setActionError(''); }} disabled={Boolean(pendingId)}>취소</button><button type="button" className="danger" onClick={removeConfirmed} disabled={Boolean(pendingId)}>{pendingId ? '방출 중…' : '팀에서 방출'}</button></div></div></div>}
    </section>
  </div>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  return <main className="login-page"><div className="login-brand"><span className="brand-mark"><i /><i /><i /></span><span><strong>국제처 업무 인수인계</strong><small>GLOBAL AFFAIRS WORKSPACE</small></span></div><section className="login-panel"><div className="login-visual"><span>2026</span><h1>업무의 흐름을<br />다음 사람에게.</h1><p>함께 만든 기록이<br />더 나은 내일의 시작이 됩니다.</p><div className="login-orbit"><i /><i /><i /></div></div><form onSubmit={(event) => { event.preventDefault(); onLogin(); }}><span className="modal-label">WELCOME BACK</span><h2>로그인</h2><p>교직원 계정으로 워크스페이스에 접속하세요.</p><label>교직원 이메일<input type="email" defaultValue="jihyun.kim@univ.ac.kr" /></label><label>비밀번호<input type="password" defaultValue="handover2026" /></label><div className="login-options"><label><input type="checkbox" defaultChecked /> 로그인 상태 유지</label><button type="button">비밀번호 찾기</button></div><button className="login-button" type="submit">워크스페이스 입장 <span>→</span></button><small className="mock-notice">DEMO MODE · 입력값과 관계없이 로그인할 수 있습니다.</small></form></section><footer><span>© 2026 GLOBAL AFFAIRS OFFICE</span><span>교직원 전용 시스템</span></footer></main>;
}

export default function Home() {
  const [view, setView] = useState<View>({ type: 'home' });
  const today = useSyncExternalStore(subscribeToday, readToday, readServerToday);
  const [loggedIn, setLoggedIn] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [memberAdminOpen, setMemberAdminOpen] = useState(false);
  const [removedMemberIds, setRemovedMemberIds] = useState<string[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersLoadError, setMembersLoadError] = useState('');
  const [taskDetail, setTaskDetail] = useState<{ task: Task; person: Person; team: Team } | null>(null);
  const teams = useMemo(() => seedTeams.map((team) => ({ ...team, people: team.people.filter((person) => !removedMemberIds.includes(person.id)) })), [removedMemberIds]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/members', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('팀원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return response.json() as Promise<{ removedMemberIds: string[] }>;
      })
      .then((data) => setRemovedMemberIds(data.removedMemberIds))
      .catch((error) => { if (error instanceof Error && error.name !== 'AbortError') setMembersLoadError(error.message); })
      .finally(() => setMembersLoading(false));
    return () => controller.abort();
  }, []);

  const removeMember = async (personId: string, teamId: string) => {
    const response = await fetch('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) });
    if (!response.ok) throw new Error('팀원을 방출하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    setRemovedMemberIds((current) => current.includes(personId) ? current : [personId, ...current]);
    if (view.type === 'person' && view.personId === personId) setView({ type: 'team', teamId });
    setTaskDetail((current) => current?.person.id === personId ? null : current);
  };

  const restoreMember = async (personId: string) => {
    const response = await fetch('/api/members', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) });
    if (!response.ok) throw new Error('팀원을 복구하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    setRemovedMemberIds((current) => current.filter((id) => id !== personId));
  };

  const openTeam = (teamId: string) => setView({ type: 'team', teamId });
  const openPerson = (teamId: string, personId: string) => setView({ type: 'person', teamId, personId });
  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />;
  const selectedTeam = view.type === 'team' || view.type === 'person' ? teams.find((team) => team.id === view.teamId) ?? null : null;
  const selectedPerson = view.type === 'person' ? selectedTeam?.people.find((person) => person.id === view.personId) ?? null : null;
  const showTask = (task: Task, person: Person) => { const team = teams.find((item) => item.people.some((member) => member.id === person.id)); if (team) setTaskDetail({ task, person, team }); };
  return <OrgContext.Provider value={teams}><TodayContext.Provider value={today}><div className={`site-shell ${view.type !== 'home' ? 'dashboard-shell' : ''}`}>
    <AppHeader compact={view.type !== 'home'} handoverActive={view.type === 'handover'} onHome={() => setView({ type: 'home' })} onHandover={() => setView({ type: 'handover' })} onSearch={() => setSearchOpen(true)} onManageMembers={() => setMemberAdminOpen(true)} onLogout={() => { setLoggedIn(false); setView({ type: 'home' }); }} />
    {view.type === 'home' && <Landing onOpen={(id) => id === 'all' ? setView({ type: 'all' }) : openTeam(id)} />}
    {view.type === 'handover' && <HandoverWorkspace onHome={() => setView({ type: 'home' })} />}
    {view.type === 'all' && <AllTeams onHome={() => setView({ type: 'home' })} onTeam={openTeam} onPerson={openPerson} />}
    {view.type === 'team' && selectedTeam && <TeamView team={selectedTeam} onHome={() => setView({ type: 'home' })} onAll={() => setView({ type: 'all' })} onTeam={openTeam} onPerson={(id) => openPerson(selectedTeam.id, id)} onTask={showTask} />}
    {view.type === 'person' && selectedTeam && selectedPerson && <PersonView team={selectedTeam} person={selectedPerson} onHome={() => setView({ type: 'home' })} onTeam={() => openTeam(selectedTeam.id)} onTask={showTask} />}
    {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onPerson={(teamId, personId) => { openPerson(teamId, personId); setSearchOpen(false); }} />}
    {memberAdminOpen && <MemberAdminModal removedMemberIds={removedMemberIds} loading={membersLoading} loadError={membersLoadError} onRemove={removeMember} onRestore={restoreMember} onClose={() => setMemberAdminOpen(false)} />}
    {taskDetail && <TaskModal {...taskDetail} onClose={() => setTaskDetail(null)} />}
  </div></TodayContext.Provider></OrgContext.Provider>;
}
