'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '../../ui';
import { taskDateLabel, taskDateRange, weekLabel, type Person, type Task } from '../../org-data';
import type { AddTaskDate, RemoveTaskDate } from '../types';

/**
 * The confirmed days inside a task's period.
 *
 * The period is planned in weeks and stays that way — a five-week campaign is a five-week
 * campaign. What the next person inherits, though, is not the plan but the day: the immigration
 * office fixed the 20th, the application closed on the 3rd. Those days are recorded against the
 * task rather than in someone's notebook, which is the whole point of the handover.
 *
 * The date input is bounded by the period, so the only days offered are days the month grid can
 * actually mark. The server enforces the same window; this only saves a round trip to hear it.
 */
export default function TaskDates({
  task,
  person,
  onAdd,
  onRemove,
}: {
  task: Task;
  person: Person;
  onAdd: AddTaskDate;
  onRemove: RemoveTaskDate;
}) {
  const dates = task.dates ?? [];
  const range = taskDateRange(task);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const close = () => { setAdding(false); setDate(''); setLabel(''); setError(''); };

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
          <small>{weekLabel(task.start)} ~ {weekLabel(task.start + task.duration - 1)} 안에서 선택합니다.</small>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); setError(''); }}>
            일자 추가
          </Button>
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
        !adding && (
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

      {!adding && error && <p className="task-dates-error" role="alert">{error}</p>}
    </section>
  );
}
