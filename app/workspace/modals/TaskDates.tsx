'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Button, Field, Input, Textarea } from '../../ui';
import { taskDateLabel, taskSpan, taskSpanLabel, type Person, type Task } from '../../org-data';
import type { AddTaskDate, AddTaskDates, RemoveTaskDate } from '../types';
import { parsePastedDates } from './task-date-paste';

/**
 * The confirmed days inside a task's period.
 *
 * The period is planned in weeks and stays that way — a five-week campaign is a five-week
 * campaign. What the next person inherits, though, is not the plan but the day: the immigration
 * office fixed the 20th, the application closed on the 3rd. Those days are recorded against the
 * task rather than in someone's notebook, which is the whole point of the handover.
 *
 * The date input is bounded by the task's span — the days its week slots stand for, or its fixed
 * period when it has one — so the only days offered are days the month grid can actually mark. The
 * server enforces the same window; this only saves a round trip to hear it.
 *
 * A year's dates rarely arrive one at a time, though — they arrive as a circular or a spreadsheet
 * column — so the same section takes a pasted block, reads every line back before anything is
 * saved, and sends only the lines that are days the task can hold.
 */
export default function TaskDates({
  task,
  person,
  onAdd,
  onAddMany,
  onRemove,
}: {
  task: Task;
  person: Person;
  onAdd: AddTaskDate;
  onAddMany: AddTaskDates;
  onRemove: RemoveTaskDate;
}) {
  /* Both feed the read-back memo below, so they have to be stable across renders themselves. */
  const dates = useMemo(() => task.dates ?? [], [task.dates]);
  const range = useMemo(() => taskSpan(task), [task]);
  const [adding, setAdding] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [pasted, setPasted] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  /* Re-read on every keystroke: the paste is judged in front of the user, not on submit. */
  const readBack = useMemo(
    () => (pasted.trim() ? parsePastedDates(pasted, range, dates.map((entry) => entry.date)) : []),
    [pasted, range, dates],
  );
  const usable = readBack.filter((line) => !line.error);
  const skipped = readBack.length - usable.length;

  const close = () => { setAdding(false); setDate(''); setLabel(''); setError(''); };
  const closePaste = () => { setPasting(false); setPasted(''); setError(''); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!date || saving) return;
    setSaving(true);
    setError('');
    try {
      await onAdd(person.id, task.title, date, label.trim());
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '확정 일자를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function submitPasted(event: FormEvent) {
    event.preventDefault();
    if (!usable.length || saving) return;
    setSaving(true);
    setError('');
    try {
      await onAddMany(person.id, task.title, usable.map(({ date: day, label: text }) => ({ date: day, label: text })));
      closePaste();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '확정 일자를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (removingId !== null) return;
    setRemovingId(id);
    setError('');
    try {
      await onRemove(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '확정 일자를 삭제하지 못했습니다.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="task-dates">
      <header className="task-dates-head">
        <div>
          <h3>확정 일자</h3>
          <small>{taskSpanLabel(task)} 안에서 선택합니다.</small>
        </div>
        {!adding && !pasting && (
          <div className="task-dates-add">
            <Button size="sm" variant="outline" onClick={() => { setAdding(true); setError(''); }}>
              일자 추가
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setPasting(true); setError(''); }}>
              여러 건 붙여넣기
            </Button>
          </div>
        )}
      </header>

      {dates.length > 0 ? (
        <ul className="task-dates-list">
          {dates.map((entry) => (
            <li key={entry.id}>
              <b>{taskDateLabel(entry.date)}</b>
              <span>{entry.label || '일정 진행'}</span>
              <small>{entry.createdBy}</small>
              <button
                type="button"
                onClick={() => remove(entry.id)}
                disabled={removingId !== null}
                aria-label={`${taskDateLabel(entry.date)} 삭제`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !adding && !pasting && (
          <p className="task-dates-empty">
            출입국 단체접수일이나 접수 마감일처럼 날짜가 정해진 일이 있다면 기록해 두세요.
          </p>
        )
      )}

      {adding && (
        <form className="task-dates-form" onSubmit={submit}>
          <Field label="날짜" required error={error || undefined}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={date}
                min={range.from}
                max={range.to}
                onChange={(event) => { setDate(event.target.value); setError(''); }}
                disabled={saving}
                required
              />
            )}
          </Field>
          <Field label="설명" hint="예: 단체접수 1차 · 원서접수 마감">
            {(id) => (
              <Input
                id={id}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={60}
                placeholder="비워 두어도 됩니다"
                disabled={saving}
              />
            )}
          </Field>
          <div className="task-dates-actions">
            <Button variant="ghost" size="sm" onClick={close} disabled={saving}>취소</Button>
            <Button variant="primary" size="sm" type="submit" busy={saving} busyLabel="저장하는 중" disabled={!date}>
              저장
            </Button>
          </div>
        </form>
      )}

      {pasting && (
        <form className="task-dates-form" onSubmit={submitPasted}>
          <Field
            label="여러 건 붙여넣기"
            hint="한 줄에 하나씩. 2026-08-20 단체접수 1차 · 8/20 단체접수 1차 · 8월 20일 모두 읽습니다."
            error={error || undefined}
          >
            {(id) => (
              <Textarea
                id={id}
                value={pasted}
                onChange={(event) => { setPasted(event.target.value); setError(''); }}
                rows={6}
                placeholder={`2026-08-20\t단체접수 1차\n9/3\t단체접수 2차`}
                disabled={saving}
              />
            )}
          </Field>

          {readBack.length > 0 && (
            <ul className="task-dates-readback">
              {readBack.map((line, index) => (
                <li className={line.error ? 'is-skipped' : ''} key={`${line.source}-${index}`}>
                  <b>{line.date ? taskDateLabel(line.date) : line.source}</b>
                  <span>{line.error || line.label || '일정 진행'}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="task-dates-actions">
            {skipped > 0 && <small className="task-dates-skipped">{skipped}건은 제외하고 저장합니다.</small>}
            <Button variant="ghost" size="sm" onClick={closePaste} disabled={saving}>취소</Button>
            <Button variant="primary" size="sm" type="submit" busy={saving} busyLabel="저장하는 중" disabled={!usable.length}>
              {usable.length ? `${usable.length}건 저장` : '저장'}
            </Button>
          </div>
        </form>
      )}

      {!adding && !pasting && error && <p className="task-dates-error" role="alert">{error}</p>}
    </section>
  );
}
