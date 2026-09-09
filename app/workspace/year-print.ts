/**
 * The academic year as paper.
 *
 * The calendar screens are the product's centre of gravity, and until now the only way to take one
 * off the screen was a phone photo of a monitor. A department's year plan is a document an office
 * actually circulates — it goes into a meeting pack, onto a wall, into a mail to a dean — so it is
 * built here as a sheet of its own rather than by asking the browser to print the workspace.
 *
 * What it is not is a screenshot of the year track. The track is a scrolling, colour-coded,
 * interactive thing sized to a monitor; on A4 it would be forty-eight columns of nothing legible.
 * The paper says the same facts in the two shapes paper is good at: a landscape grid that shows
 * when the year is busy, and a table under it that names every task with the week it opens and how
 * long it runs. The grid is for the wall; the table is what somebody reads.
 *
 * `../print-sheet` carries the mounting, the isolation and the print call. Everything here is what
 * a year plan says.
 */

import {
  SLOTS_PER_MONTH,
  WEEKS_IN_YEAR,
  academicYearLabel,
  academicYearRangeLabel,
  months,
  taskLengthLabel,
  taskStartLabel,
  taskTrack,
  type Person,
  type Team,
} from '../org-data';
import { baseSheetStyles, escapeHtml, printSheet, standaloneDocument, type Sheet } from '../print-sheet';

/** Which slice of the org the sheet covers, which is what its cover line says. */
export type YearScope =
  | { kind: 'office'; teams: Team[] }
  | { kind: 'team'; team: Team }
  | { kind: 'person'; team: Team; person: Person };

export type YearPrintMeta = {
  organization?: string;
  /** the week of the year today falls in, marked on the grid; null outside the academic year */
  todayWeek: number | null;
};

const onDate = (value: Date) => value.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Landscape, because twelve months of a year read across rather than down.
 *
 * The grid's cells are sized in `fr` off a table layout rather than in millimetres: a part with
 * three people and a part with six both have to fit the same page width, and the only thing that
 * changes between them is how many rows there are. Row heights are fixed so a page break lands
 * between rows instead of through one.
 */
const yearSheetStyles = `
  ${baseSheetStyles({ size: 'A4 landscape', margin: '14mm 12mm 12mm' })}
  __ROOT__ { font-size: 10pt; line-height: 1.5; }

  __SCOPE__ .cover { display: flex; align-items: flex-end; gap: 10pt; border-bottom: 2pt solid #14181d; padding-bottom: 8pt; margin-bottom: 12pt; }
  __SCOPE__ .cover h1 { font-size: 17pt; }
  __SCOPE__ .cover .scope { font-size: 11pt; color: #1d5f92; font-weight: 600; }
  __SCOPE__ .cover .range { margin-left: auto; font-size: 9.5pt; color: #5b6673; letter-spacing: 0.02em; }

  /* ---- the grid ---------------------------------------------------------- */
  __SCOPE__ .track { width: 100%; margin-bottom: 14pt; table-layout: fixed; break-inside: auto; }
  __SCOPE__ .track th, __SCOPE__ .track td { border: 0.4pt solid #dde4eb; padding: 0; }
  __SCOPE__ .track thead th { background: #f1f4f7; font-size: 8.5pt; font-weight: 600; color: #3c4756; padding: 3pt 0; }
  __SCOPE__ .track thead th.who { width: 26%; text-align: left; padding-left: 6pt; }
  __SCOPE__ .track tbody th {
    width: 26%;
    padding: 4pt 6pt;
    text-align: left;
    font-weight: 600;
    font-size: 9pt;
    vertical-align: middle;
    background: #fbfcfd;
  }
  __SCOPE__ .track tbody th small { display: block; font-weight: 400; font-size: 8pt; color: #5b6673; }
  __SCOPE__ .track tbody tr { break-inside: avoid; }
  /* One cell per week. A cell is either empty or carries the part's colour, which is the whole of
     what the grid says: this person is busy that week. */
  __SCOPE__ .track td { height: 16pt; }
  __SCOPE__ .track td.on { background: var(--mark, #1d5f92); }
  __SCOPE__ .track td.month-edge { border-left: 0.7pt solid #b9c3ce; }
  /* Today, drawn as a rule down the whole grid rather than as a marked cell. */
  __SCOPE__ .track td.now, __SCOPE__ .track th.now { box-shadow: inset 1.2pt 0 0 #d08700; }
  __SCOPE__ .track-key { display: flex; gap: 12pt; margin: -8pt 0 14pt; font-size: 8.5pt; color: #5b6673; }
  __SCOPE__ .track-key i { display: inline-block; width: 9pt; height: 7pt; margin-right: 3pt; vertical-align: -0.5pt; }

  /* ---- the schedule ------------------------------------------------------ */
  __SCOPE__ .part { break-inside: auto; margin-bottom: 12pt; }
  __SCOPE__ .part-head { display: flex; align-items: baseline; gap: 7pt; border-left: 3pt solid var(--mark, #1d5f92); padding: 1pt 0 1pt 7pt; margin-bottom: 6pt; }
  __SCOPE__ .part-head h2 { font-size: 12pt; }
  __SCOPE__ .part-head span { font-size: 8.5pt; color: #5b6673; }
  __SCOPE__ .plan { width: 100%; font-size: 9pt; }
  __SCOPE__ .plan th, __SCOPE__ .plan td { border: 0.4pt solid #dde4eb; padding: 3pt 6pt; text-align: left; vertical-align: top; }
  __SCOPE__ .plan thead th { background: #f1f4f7; font-weight: 600; color: #3c4756; font-size: 8.5pt; }
  __SCOPE__ .plan tbody tr { break-inside: avoid; }
  __SCOPE__ .plan .who { width: 17%; font-weight: 600; }
  __SCOPE__ .plan .who small { display: block; font-weight: 400; color: #5b6673; font-size: 8pt; }
  __SCOPE__ .plan .when { width: 13%; white-space: nowrap; color: #3c4756; }
  __SCOPE__ .plan .span { width: 9%; white-space: nowrap; color: #5b6673; }
  __SCOPE__ .plan .note { color: #3c4756; }
  __SCOPE__ .plan .fixed { color: #1d5f92; font-weight: 600; }
`;

/** Every person the scope covers, each carrying the part they belong to. */
function peopleOf(scope: YearScope): { team: Team; person: Person }[] {
  if (scope.kind === 'person') return [{ team: scope.team, person: scope.person }];
  const teams = scope.kind === 'team' ? [scope.team] : scope.teams;
  return teams.flatMap((team) => team.people.map((person) => ({ team, person })));
}

/** "국제처 전체" · "유학생관리 파트" · "박민서 (유학생관리)" — what the cover calls this sheet. */
function scopeLabel(scope: YearScope) {
  if (scope.kind === 'office') return '국제처 전체';
  if (scope.kind === 'team') return `${scope.team.title} 파트`;
  return `${scope.person.name} · ${scope.team.title}`;
}

/**
 * The weeks a person is on something, as a 48-long set.
 *
 * Read off `taskTrack` rather than off `task.start`, so a task whose days are settled is marked on
 * the weeks it actually runs rather than the weeks it was once planned for — the same reading the
 * year track on screen uses.
 */
function busyWeeks(person: Person) {
  const busy = new Set<number>();
  for (const task of person.tasks) {
    const track = taskTrack(task);
    for (let week = track.start; week < track.start + track.duration; week += 1) {
      if (week >= 0 && week < WEEKS_IN_YEAR) busy.add(week);
    }
  }
  return busy;
}

function trackTable(rows: { team: Team; person: Person }[], todayWeek: number | null) {
  const header = months
    .map((month) => `<th colspan="${SLOTS_PER_MONTH}">${escapeHtml(month)}</th>`)
    .join('');

  const body = rows.map(({ team, person }) => {
    const busy = busyWeeks(person);
    const cells = Array.from({ length: WEEKS_IN_YEAR }, (_, week) => {
      const classes = [
        busy.has(week) ? 'on' : '',
        week % SLOTS_PER_MONTH === 0 ? 'month-edge' : '',
        week === todayWeek ? 'now' : '',
      ].filter(Boolean).join(' ');
      return `<td${classes ? ` class="${classes}"` : ''}></td>`;
    }).join('');
    return `<tr style="--mark:${escapeHtml(team.color)}">
      <th>${escapeHtml(person.name)}<small>${escapeHtml(team.short)} · ${escapeHtml(person.role)}</small></th>
      ${cells}
    </tr>`;
  }).join('');

  /*
   * The key names the colours that are actually on the page.
   *
   * It used to be one blue swatch reading "업무가 있는 주" — and the blue was
   * `#1d5f92`, which is not a generic "there is work here" colour, it is the
   * 유학생관리 part. On an office-wide sheet the reader saw four colours in the
   * chart and a key that explained one of them, under a label claiming to
   * explain all four. Built from the rows instead: one swatch per part that is
   * on this sheet, in the order the sheet prints them. A part or person sheet
   * has exactly one, so it collapses back to the single swatch it always was —
   * this time in that part's own colour.
   */
  const parts: Team[] = [];
  for (const { team } of rows) if (!parts.some((seen) => seen.id === team.id)) parts.push(team);
  const swatches = parts.length === 1
    ? `<span><i style="background:${escapeHtml(parts[0].color)}"></i>업무가 있는 주</span>`
    : parts.map((team) => `<span><i style="background:${escapeHtml(team.color)}"></i>${escapeHtml(team.short)}</span>`).join('');

  return `<table class="track">
    <thead><tr><th class="who">담당자</th>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <p class="track-key">
    ${swatches}
    ${todayWeek === null ? '' : '<span><i style="background:#d08700;width:1.6pt"></i>이번 주</span>'}
    <span>세로선은 달의 경계입니다.</span>
  </p>`;
}

/** One part's people and their tasks, in the order the year runs. */
function planTable(team: Team, people: Person[]) {
  const rows = people.flatMap((person) => {
    const tasks = [...person.tasks].sort((first, second) => taskTrack(first).start - taskTrack(second).start);
    if (!tasks.length) {
      return [`<tr><td class="who">${escapeHtml(person.name)}<small>${escapeHtml(person.role)}</small></td>
        <td class="when">—</td><td class="span">—</td><td class="note"><span class="empty">등록된 연간 업무가 없습니다.</span></td></tr>`];
    }
    return tasks.map((task, index) => {
      /* The name and the role are printed once per person, not once per task: a table that repeats
         "박민서 / 체류·비자 관리" four times reads as four people at a glance. */
      const who = index === 0
        ? `<td class="who" rowspan="${tasks.length}">${escapeHtml(person.name)}<small>${escapeHtml(person.role)}</small></td>`
        : '';
      const settled = (task.dates?.length ?? 0) > 0 || Boolean(task.period);
      return `<tr>${who}
        <td class="when${settled ? ' fixed' : ''}">${escapeHtml(taskStartLabel(task))}</td>
        <td class="span">${escapeHtml(taskLengthLabel(task))}</td>
        <td class="note">${escapeHtml(task.title)}${task.note ? ` <span style="color:#5b6673">— ${escapeHtml(task.note)}</span>` : ''}</td>
      </tr>`;
    });
  }).join('');

  return `<section class="part" style="--mark:${escapeHtml(team.color)}">
    <div class="part-head"><h2>${escapeHtml(team.title)}</h2><span>${escapeHtml(team.english)} · 담당자 ${people.length}명</span></div>
    <table class="plan">
      <thead><tr><th class="who">담당자</th><th class="when">시작</th><th class="span">기간</th><th class="note">업무</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

export function buildYearSheetBody(scope: YearScope, meta: YearPrintMeta) {
  const organization = meta.organization ?? '국제처';
  const rows = peopleOf(scope);
  const teams = scope.kind === 'office' ? scope.teams : scope.kind === 'team' ? [scope.team] : [scope.team];
  const plans = teams
    .map((team) => planTable(team, rows.filter((row) => row.team.id === team.id).map((row) => row.person)))
    .join('');
  const taskCount = rows.reduce((total, row) => total + row.person.tasks.length, 0);

  return `<header class="cover">
    <div>
      <h1>${escapeHtml(organization)} 연간 업무표</h1>
      <div class="scope">${escapeHtml(scopeLabel(scope))} · 담당자 ${rows.length}명 · 업무 ${taskCount}건</div>
    </div>
    <div class="range">${escapeHtml(academicYearLabel)} · ${escapeHtml(academicYearRangeLabel)}</div>
  </header>

  ${rows.length ? trackTable(rows, meta.todayWeek) : '<p class="empty">표시할 담당자가 없습니다.</p>'}
  ${plans}

  <footer class="sheet-foot">${escapeHtml(organization)} 업무 인수인계 워크스페이스에서 출력 · ${escapeHtml(onDate(new Date()))}</footer>`;
}

function yearSheet(scope: YearScope, meta: YearPrintMeta): Sheet {
  return {
    title: `${academicYearLabel} ${meta.organization ?? '국제처'} 연간 업무표 - ${scopeLabel(scope)}`,
    styles: yearSheetStyles,
    body: buildYearSheetBody(scope, meta),
  };
}

/** The year plan as one standalone HTML document. Exported so it can be tested and previewed. */
export function buildYearPrintHtml(scope: YearScope, meta: YearPrintMeta) {
  return standaloneDocument(yearSheet(scope, meta));
}

/** Hands the year plan to the browser's print dialog, where the reader saves it as PDF. */
export function printYearPlan(scope: YearScope, meta: YearPrintMeta) {
  printSheet(yearSheet(scope, meta));
}
