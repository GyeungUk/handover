'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '../../ui';
import {
  academicYearBounds,
  academicYearLabel,
  taskDateLabel,
  taskPeriodLabel,
  taskSpan,
  weekLabel,
  type Person,
  type Task,
} from '../../org-data';
import type { ClearTaskPeriod, SetTaskPeriod } from '../types';

/**
 * Whether this task is planned in weeks or fixed to real dates, and switching between the two.
 *
 * Most of the plan is genuinely vague — "8월 2주부터 5주간" is the honest statement of a campaign
 * nobody scheduled to the day — and writing dates on it would invent precision the office does not
 * have. The rest is the opposite case: the days are settled, and leaving "9월 3주" on the record
 * hands the next person a guess where there was an answer. The section exists so a task can say
 * which of the two it is, rather than every reader having to assume one.
 *
 * The dates are the record once they are set; the week slots stay underneath, untouched, which is
 * why returning to them takes nothing but clearing the period. That is also why clearing is worded
 * as a return rather than a delete — nothing about the plan is lost.
 */
export default function TaskPeriodSection({
  task,
  person,
  onSet,
  onClear,
}: {
  task: Task;
  person: Person;
  onSet: SetTaskPeriod;
  onClear: ClearTaskPeriod;
}) {
  const span = taskSpan(task);
  const [editing, setEditing] = useState(false);
  /* Prefilled with the days the task already covers, so fixing an unfixed task is a nudge rather
     than a blank pair of inputs asking the author to re-type what the calendar already shows. */
  const [startsOn, setStartsOn] = useState(span.from);
  const [endsOn, setEndsOn] = useState(span.to);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');

  const open = () => {
    setStartsOn(span.from);
    setEndsOn(span.to);
    setError('');
    setEditing(true);
  };
  const close = () => { setEditing(false); setError(''); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !startsOn || !endsOn) return;
    if (endsOn < startsOn) { setError('종료일이 시작일보다 빠를 수 없습니다.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSet(person.id, task.title, startsOn, endsOn);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '확정 기간을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    if (clearing) return;
    setClearing(true);
    setError('');
    try {
      await onClear(person.id, task.title);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '확정 기간을 해제하지 못했습니다.');
    } finally {
      setClearing(false);
    }
  }

  const busy = saving || clearing;

  return (
    <section className={`task-period ${task.period ? 'is-fixed' : ''}`}>
      <header className="task-period-head">
        <div>
          <h3>확정 기간</h3>
          <small>
            {task.period
              ? '날짜가 확정된 일정입니다. 캘린더와 인수인계 문서가 이 날짜를 따릅니다.'
              : '주 단위로 계획된 일정입니다. 날짜가 정해지면 확정해 주세요.'}
          </small>
        </div>
        {!editing && (
          <div className="task-period-actions">
            <Button size="sm" variant="outline" onClick={open} disabled={busy}>
              {task.period ? '기간 수정' : '날짜로 확정'}
            </Button>
            {task.period && (
              <Button size="sm" variant="ghost" onClick={clear} busy={clearing} busyLabel="해제하는 중">
                주 단위로 되돌리기
              </Button>
            )}
          </div>
        )}
      </header>

      {!editing && (
        <p className="task-period-state">
          {task.period ? (
            <>
              <b>{taskDateLabel(task.period.startsOn)}</b>
              <i aria-hidden="true">→</i>
              <b>{taskDateLabel(task.period.endsOn)}</b>
              {/* Not "as planned" — the slots named here are the ones the dates land on, which is
                  where the year track draws the task now. */}
              <small>{task.period.setBy} 확정 · 연간 일정 {taskPeriodLabel(task)}</small>
            </>
          ) : (
            <>
              <b>{weekLabel(task.start)}</b>
              <i aria-hidden="true">→</i>
              <b>{weekLabel(task.start + task.duration - 1)}</b>
              <small>{academicYearLabel} 주 단위 계획</small>
            </>
          )}
        </p>
      )}

      {editing && (
        <form className="task-period-form" onSubmit={submit}>
          <div className="task-period-fields">
            <Field label="시작일" required>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={startsOn}
                  min={academicYearBounds.from}
                  max={academicYearBounds.to}
                  onChange={(event) => { setStartsOn(event.target.value); setError(''); }}
                  disabled={saving}
                  required
                />
              )}
            </Field>
            <Field label="종료일" required>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={endsOn}
                  min={startsOn || academicYearBounds.from}
                  max={academicYearBounds.to}
                  onChange={(event) => { setEndsOn(event.target.value); setError(''); }}
                  disabled={saving}
                  required
                />
              )}
            </Field>
          </div>

          {/* Said before the save, because the two things it changes are both off-screen: the year
              track re-places the task, and any confirmed day outside the new dates blocks it. */}
          <p className="task-period-note">
            확정하면 연간·월간 캘린더가 주 슬롯 대신 이 날짜를 따르고, 주 단위 일정 변경은 잠깁니다.
          </p>

          {error && <p className="task-period-error" role="alert">{error}</p>}

          <div className="task-period-form-actions">
            <Button variant="ghost" size="sm" onClick={close} disabled={saving}>취소</Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              busy={saving}
              busyLabel="저장하는 중"
              disabled={!startsOn || !endsOn}
            >
              기간 확정
            </Button>
          </div>
        </form>
      )}

      {!editing && error && <p className="task-period-error" role="alert">{error}</p>}
    </section>
  );
}
