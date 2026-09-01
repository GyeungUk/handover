import { isoDate } from '../../org-data';

/**
 * Reading a pasted block of dates.
 *
 * A year's dates reach a desk as a circular or a spreadsheet column, not as twelve visits to a
 * date picker, and they are written the way the sender happened to write them: `2026-08-20`,
 * `2026.08.20.`, `8/20`, `8월 20일`. All of those are the same day, so all of them parse. What
 * follows the date on the line is the label, however it was separated — a tab out of a
 * spreadsheet, a comma, or plain spaces.
 *
 * Nothing here writes: every line comes back either as a day or as the reason it is not one, and
 * the caller shows both before anything is saved.
 */

export type ParsedDate = { source: string; date: string; label: string; error: string };

const DATE_PATTERNS: RegExp[] = [
  /* 2026-08-20 · 2026.08.20 · 2026/08/20, with the trailing dot a Korean date often carries */
  /^(\d{4})[.\-/\s]\s*(\d{1,2})[.\-/\s]\s*(\d{1,2})\.?/,
  /* 2026년 8월 20일 */
  /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일?/,
  /* 8월 20일 — the year is the one the task runs in */
  /^()(\d{1,2})월\s*(\d{1,2})일?/,
  /* 8/20 · 08.20 · 8-20 */
  /^()(\d{1,2})[.\-/](\d{1,2})\.?/,
];

/** A real day, not just three numbers: 2월 30일 parses and then fails here. */
function isRealDate(year: number, month: number, day: number) {
  const made = new Date(year, month - 1, day);
  return made.getFullYear() === year && made.getMonth() === month - 1 && made.getDate() === day;
}

/**
 * The date a line opens with, and where it ends.
 *
 * A line that names no year is dated into the task's own period — which can straddle a new year,
 * so both candidate years are tried and the one that lands inside the period wins.
 */
function readDate(line: string, range: { from: string; to: string }) {
  for (const pattern of DATE_PATTERNS) {
    const found = line.match(pattern);
    if (!found) continue;
    const [matched, yearText, monthText, dayText] = found;
    const month = Number(monthText);
    const day = Number(dayText);
    const years = yearText
      ? [Number(yearText)]
      : [Number(range.from.slice(0, 4)), Number(range.to.slice(0, 4))];
    for (const year of years) {
      if (!isRealDate(year, month, day)) continue;
      const date = isoDate(year, month, day);
      if (yearText || (date >= range.from && date <= range.to)) return { date, rest: line.slice(matched.length) };
    }
    /* The numbers read as a date but no year puts them in the period; report the first try. */
    if (isRealDate(years[0], month, day)) {
      return { date: isoDate(years[0], month, day), rest: line.slice(matched.length) };
    }
  }
  return null;
}

export function parsePastedDates(
  text: string,
  range: { from: string; to: string },
  taken: string[],
): ParsedDate[] {
  const seen = new Set(taken);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((source) => {
      const read = readDate(source, range);
      if (!read) return { source, date: '', label: '', error: '날짜를 찾지 못했습니다' };
      const label = read.rest.replace(/^[\s\t,·:|-]+/, '').trim().slice(0, 60);
      const entry = { source, date: read.date, label, error: '' };
      if (read.date < range.from || read.date > range.to) return { ...entry, error: '업무 기간 밖입니다' };
      if (seen.has(read.date)) return { ...entry, error: '이미 등록된 날짜입니다' };
      seen.add(read.date);
      return entry;
    });
}
