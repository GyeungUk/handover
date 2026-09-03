/** Shared org chart + academic-year helpers, used by the client workspace and the API routes. */

/**
 * A confirmed calendar date inside a task's period.
 *
 * The plan is kept in week slots, which is what the work is planned at and what the academic-year
 * alignment moves. Some of the work underneath it is not planned at all — an immigration office
 * fixes the day of a group appointment, the university publishes the day an application closes —
 * and those days are recorded here rather than by narrowing the plan to them.
 */
export type TaskDate = {
  id: number;
  /** `YYYY-MM-DD`; a plain date, never a timestamp */
  date: string;
  /** what happens that day, e.g. "단체접수 1차"; blank when the day speaks for itself */
  label: string;
  createdBy: string;
  createdAt: string;
};

/**
 * The real dates a task runs on, when its days are actually settled.
 *
 * The plan is kept in week slots because most of it is genuinely that vague — "8월 2주부터 5주간"
 * is the honest statement of a campaign nobody scheduled to the day. Work whose days really are
 * settled is the other case, and calling it vague is its own kind of wrong: the next person
 * inherits "9월 3주" when what happened was 9월 14일부터 9월 18일까지. A task in that state carries
 * a period, and the period outranks the slots wherever days are drawn.
 */
export type TaskPeriod = {
  /** `YYYY-MM-DD`, both ends inclusive */
  startsOn: string;
  endsOn: string;
  setBy: string;
};

export type Task = {
  title: string;
  start: number;
  duration: number;
  note: string;
  /** week the task originally started on, present only while a reschedule is in effect */
  movedFrom?: number;
  /** confirmed days inside the period, oldest first; absent until somebody records one */
  dates?: TaskDate[];
  /** the real dates the task runs on; absent while it is planned in week slots alone */
  period?: TaskPeriod;
};
export type Person = { id: string; name: string; role: string; initial: string; tasks: Task[] };
export type Team = { id: string; title: string; short: string; english: string; description: string; color: string; soft: string; mark: string; people: Person[] };

/** the academic year is 48 week slots, 4 per month, opening in `months[0]` of `ACADEMIC_YEAR_START` */
export const WEEKS_IN_YEAR = 48;
/** week slots to a month. A slot is a quarter of a month rather than an ISO week. */
export const SLOTS_PER_MONTH = 4;
export const months = ['3월','4월','5월','6월','7월','8월','9월','10월','11월','12월','1월','2월'];

/**
 * The calendar year the academic year opens in. Every date boundary below is derived from this and
 * from `months`, so rolling the workspace over to a new year is a one-line change here rather than a
 * hunt for years buried in comparisons. `baseAcademicYear` in `academic-calendar.ts` re-exports it.
 */
export const ACADEMIC_YEAR_START = 2026;

/** The calendar month the year opens on, read from the first month label ("3월" -> 3). */
const START_MONTH = Number(months[0].replace(/[^0-9]/g, ''));

/** "2026학년도" — how the academic year is named wherever a user reads it. */
export const academicYearLabel = `${ACADEMIC_YEAR_START}학년도`;

/** "2026. 03 — 2027. 02" — the window the year covers, both ends inclusive. */
export const academicYearRangeLabel = [
  `${ACADEMIC_YEAR_START}. ${String(START_MONTH).padStart(2, '0')}`,
  `${ACADEMIC_YEAR_START + 1}. ${String(((START_MONTH + 10) % 12) + 1).padStart(2, '0')}`,
].join(' — ');

export const seedTeams: Team[] = [
  {
    id: 'management', title: '유학생관리', short: '유학생관리', english: 'STUDENT CARE', mark: '01', color: '#1d5f92', soft: '#e5eef6',
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
    id: 'recruitment', title: '유학생유치', short: '유학생유치', english: 'GLOBAL ADMISSIONS', mark: '02', color: '#9a6a24', soft: '#f6efe1',
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
    id: 'exchange', title: '교류', short: '교류', english: 'GLOBAL EXCHANGE', mark: '03', color: '#1f7a70', soft: '#e3f1ef',
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
    id: 'language', title: '한국어교육원', short: '한국어교육원', english: 'KOREAN LANGUAGE', mark: '04', color: '#6a559b', soft: '#eeeaf7',
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

/** stable identity for a task across reschedules: a person never repeats a task title */
export const taskKey = (personId: string, title: string) => `${personId}::${title}`;

export function findSeedTask(personId: string, title: string) {
  for (const team of seedTeams) {
    const person = team.people.find((item) => item.id === personId);
    if (person) return person.tasks.find((task) => task.title === title) ?? null;
  }
  return null;
}

/** "3월 2주" — the label used everywhere a week slot is shown to a user */
export const weekLabel = (week: number) =>
  `${months[Math.floor(week / SLOTS_PER_MONTH)]} ${(week % SLOTS_PER_MONTH) + 1}주`;

export type Today = { week: number | null; month: number | null; day: number | null };
export const noToday: Today = { week: null, month: null, day: null };

/** Locate a real date inside the academic year (48 weeks, 4 per month), or `noToday` outside it. */
export function locateToday(now: Date): Today {
  /* Date months are 0-based, so the opening month is one less than its label. */
  const opensOn = new Date(ACADEMIC_YEAR_START, START_MONTH - 1, 1);
  const closesBefore = new Date(ACADEMIC_YEAR_START + 1, START_MONTH - 1, 1);
  if (now < opensOn || now >= closesBefore) return noToday;
  const month = (now.getMonth() - (START_MONTH - 1) + 12) % 12;
  const weekOfMonth = Math.min(3, Math.floor((now.getDate() - 1) / 7));
  return { week: month * 4 + weekOfMonth, month, day: now.getDate() };
}

/** "8월 2주 ~ 9월 2주" — the span a task occupies, both ends inclusive */
export const taskPeriodLabel = (task: Task) => `${weekLabel(task.start)} ~ ${weekLabel(task.start + task.duration - 1)}`;

/** The calendar year and 1-based month an academic month index falls in. */
export function calendarMonth(monthIndex: number) {
  const absolute = START_MONTH - 1 + monthIndex;
  return { year: ACADEMIC_YEAR_START + Math.floor(absolute / 12), month: (absolute % 12) + 1 };
}

/**
 * The days of the month a week slot stands for.
 *
 * Four slots to a month, so slot n is its days 7n+1 to 7n+7 and the last slot keeps whatever the
 * month has left over. Every part of the workspace that turns a week into a date goes through
 * here — the month grid draws its bands with it, the task detail offers dates inside it, and the
 * backend validates against the same arithmetic — so they cannot disagree about where a week is.
 */
export function weekSlotDays(week: number) {
  const slot = week % SLOTS_PER_MONTH;
  const { year, month } = calendarMonth(Math.floor(week / SLOTS_PER_MONTH));
  return {
    year,
    month,
    from: slot * 7 + 1,
    to: slot === SLOTS_PER_MONTH - 1 ? new Date(year, month, 0).getDate() : (slot + 1) * 7,
  };
}

/** `2026-08-08` — an ISO date built from calendar parts, without `toISOString`'s timezone shift. */
export const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * The first and last date the academic year covers, as the `min` and `max` a date input takes.
 *
 * Day 0 of a month is the last day of the one before it, so the year closes the day before it
 * would open again — which keeps February's length out of this. The server bounds a fixed period
 * by the same window and says so when it rejects one.
 */
export const academicYearBounds = {
  from: isoDate(ACADEMIC_YEAR_START, START_MONTH, 1),
  to: isoDate(
    ACADEMIC_YEAR_START + 1,
    START_MONTH === 1 ? 12 : START_MONTH - 1,
    new Date(ACADEMIC_YEAR_START + 1, START_MONTH - 1, 0).getDate(),
  ),
};

/** The calendar parts of an ISO date, read off the string rather than through `Date`'s timezone. */
export function dateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/**
 * The first and last date a task covers, both ends inclusive.
 *
 * A task's days come from one of two places. Most are planned in week slots, and their days are
 * the ones those slots stand for — derived, and moved wholesale when the academic year shifts. A
 * task whose days are settled carries a fixed period instead and covers those dates exactly.
 * Everything needing a window — the band the month grid draws, the days a confirmed date may fall
 * on — asks here rather than re-deriving one from week slots, so the two kinds of task are the
 * same shape to every reader. `DateSpan` on the server is this function's counterpart.
 */
export function taskSpan(task: Task) {
  if (task.period) return { from: task.period.startsOn, to: task.period.endsOn, fixed: true };
  const opens = weekSlotDays(task.start);
  const closes = weekSlotDays(task.start + task.duration - 1);
  return {
    from: isoDate(opens.year, opens.month, opens.from),
    to: isoDate(closes.year, closes.month, closes.to),
    fixed: false,
  };
}

/**
 * A task's confirmed days, oldest first — empty while it is still only planned.
 *
 * The server lists them in date order, but a day recorded during this session is appended to what
 * is already held, so the sort here is what makes "the first one" mean the earliest one.
 */
export function confirmedDays(task: Task) {
  return [...(task.dates ?? [])].sort((first, second) => first.date.localeCompare(second.date));
}

/**
 * The week slots a task is drawn on: the ones its confirmed days fall in once there are any, and
 * the ones it is planned on while there are none.
 *
 * A loose plan is a guess about where the work will land — "8월 2주부터 5주간" — and a confirmed
 * day is not a guess. Once the day exists, drawing the guess beside it says the work runs for five
 * weeks when what happens is one morning at the immigration office, so the calendar stops drawing
 * it. The plan is not thrown away: it is still the window a further day may be recorded in, which
 * is why this returns a reading of the task rather than rewriting the task itself.
 */
export function taskTrack(task: Task) {
  const days = confirmedDays(task);
  if (!days.length) return { start: task.start, duration: task.duration, settled: false };
  const weeks = days.map((day) => Math.max(0, Math.min(WEEKS_IN_YEAR - 1, weekOfDate(day.date))));
  const start = Math.min(...weeks);
  return { start, duration: Math.max(...weeks) - start + 1, settled: true };
}

/** "8월 20일 (목)" — how a confirmed date reads next to the week it sits in. */
export function taskDateLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(year, month - 1, day).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

/**
 * The week slot a date falls in — the inverse of `weekSlotDays`.
 *
 * Days 1-7 of a month are its slot 0 and so on, with the last slot keeping whatever the month has
 * left over, which is why the day is clamped rather than divided outright. The server's
 * `AcademicCalendar.weekOf` is the same arithmetic; a date-fixed task is placed on the year track
 * with it, so the two have to agree.
 */
export function weekOfDate(date: string) {
  const { year, month, day } = dateParts(date);
  const monthIndex = (year - ACADEMIC_YEAR_START) * 12 + (month - START_MONTH);
  return monthIndex * SLOTS_PER_MONTH + Math.min(SLOTS_PER_MONTH - 1, Math.floor((day - 1) / 7));
}

/** "8월 12일 ~ 9월 3일" for a fixed period, "8월 2주 ~ 9월 2주" for one planned in weeks. */
export function taskSpanLabel(task: Task) {
  if (!task.period) return taskPeriodLabel(task);
  const opens = dateParts(task.period.startsOn);
  const closes = dateParts(task.period.endsOn);
  return `${opens.month}월 ${opens.day}일 ~ ${closes.month}월 ${closes.day}일`;
}

/** "9월 14일 (월)" or "9월 3주" — where a task starts, in the unit it is actually known in. */
export function taskStartLabel(task: Task) {
  const days = confirmedDays(task);
  if (days.length) return taskDateLabel(days[0].date);
  return task.period ? taskDateLabel(task.period.startsOn) : weekLabel(task.start);
}

/** "5주" · "12일" · "확정 3일" — how much calendar a task takes, in the unit it is actually known in. */
export function taskLengthLabel(task: Task) {
  const settled = confirmedDays(task);
  if (settled.length) return `확정 ${settled.length}일`;
  if (!task.period) return `${task.duration}주`;
  const days = Math.round((Date.parse(task.period.endsOn) - Date.parse(task.period.startsOn)) / 86_400_000) + 1;
  return `${days}일`;
}

export type TaskPhase = 'done' | 'active' | 'upcoming';

/**
 * Where a task sits relative to today. Drives which handover section it seeds.
 *
 * Read off the slots the task is drawn on, so a task whose days are confirmed is judged by those
 * days rather than by the window it was once planned in — the same weeks the calendar shows.
 */
export function taskPhase(task: Task, todayWeek: number): TaskPhase {
  const { start, duration } = taskTrack(task);
  if (start + duration <= todayWeek) return 'done';
  if (start <= todayWeek) return 'active';
  return 'upcoming';
}

export function findPerson(personId: string) {
  for (const team of seedTeams) {
    const person = team.people.find((item) => item.id === personId);
    if (person) return { team, person };
  }
  return null;
}
