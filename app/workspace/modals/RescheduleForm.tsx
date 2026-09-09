'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, IconRefresh, Select, Textarea } from '../../ui';
import { WEEKS_IN_YEAR, weekLabel, type Person, type Task } from '../../org-data';
import type { Reschedule, ScheduleChange } from '../types';

/** `2026. 03. 04` — the trail is read far more often than it is written. */
function formatChangedAt(value: string) {
  const changed = new Date(value);
  return Number.isNaN(changed.getTime())
    ? value
    : `${changed.getFullYear()}. ${String(changed.getMonth() + 1).padStart(2, '0')}. ${String(changed.getDate()).padStart(2, '0')}`;
}

/**
 * Moving a task, with a reason.
 *
 * The reason is required and the form says so before you type rather than after
 * you submit — a move without one is unreadable to whoever inherits the trail.
 *
 * A task fixed to real dates is not moved from here at all. Its week slots are
 * derived from those dates, so a move written against them would be overruled
 * the moment the calendar redrew it, and the server rejects one for the same
 * reason. Which of the two is true — the dates or the new weeks — is the
 * author's call, so the form points at the period rather than guessing.
 */
export function RescheduleForm({ task, person, onReschedule }: { task: Task; person: Person; onReschedule: Reschedule }) {
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

  if (task.period) {
    return (
      <p className="reschedule-locked">
        날짜가 확정된 일정은 주 단위로 변경할 수 없습니다. 위 <b>확정 기간</b>에서 날짜를 수정하거나,
        주 단위로 되돌린 뒤 변경해 주세요.
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" block onClick={() => { setOpen(true); setError(''); }} leading={<IconRefresh />}>
        일정 변경 · 연기하기
      </Button>
    );
  }

  return (
    <form className="reschedule-form" onSubmit={submit}>
      <div className="reschedule-head">
        <strong>일정 변경</strong>
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setError(''); setTarget(task.start); }} disabled={saving}>
          취소
        </Button>
      </div>

      <div className="reschedule-quick">
        <Button size="sm" variant="outline" onClick={() => shift(-1)} disabled={saving || target === 0}>‹ 1주 당김</Button>
        <Button size="sm" variant="outline" onClick={() => shift(1)} disabled={saving || target === lastStart}>1주 연기</Button>
        <Button size="sm" variant="outline" onClick={() => shift(2)} disabled={saving || target === lastStart}>2주 연기</Button>
        <Button size="sm" variant="outline" onClick={() => shift(4)} disabled={saving || target === lastStart}>4주 연기</Button>
        {task.movedFrom !== undefined && (
          <Button size="sm" variant="ghost" onClick={() => setTarget(originalStart)} disabled={saving || target === originalStart}>
            원래 일정으로
          </Button>
        )}
      </div>

      <Field label="새 시작 시점">
        {(id) => (
          <Select id={id} value={target} onChange={(event) => setTarget(Number(event.target.value))} disabled={saving}>
            {Array.from({ length: lastStart + 1 }, (_, week) => (
              <option value={week} key={week}>{weekLabel(week)}{week === task.start ? ' · 현재' : ''}</option>
            ))}
          </Select>
        )}
      </Field>

      <p className="reschedule-preview">
        <b>{weekLabel(task.start)}</b>
        <i aria-hidden="true">→</i>
        <b>{weekLabel(target)}</b>
        <span>{delta === 0 ? '변동 없음' : delta > 0 ? `${delta}주 연기` : `${-delta}주 앞당김`}</span>
      </p>

      <Field label="변경 사유" hint="필수 · 이 문장이 다음 담당자에게 남습니다." error={error || undefined}>
        {(id) => (
          <Textarea
            id={id}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            rows={3}
            placeholder="예: 출입국관리사무소 단체접수 일정이 2주 순연되어 함께 조정"
            disabled={saving}
          />
        )}
      </Field>

      <Button variant="primary" type="submit" block busy={saving} busyLabel="변경하는 중">변경 사유와 함께 저장</Button>
    </form>
  );
}

export function RescheduleHistory({ history }: { history: ScheduleChange[] }) {
  if (!history.length) return null;
  return (
    <div className="reschedule-history">
      <strong>일정 변경 이력 <span>{history.length}</span></strong>
      {[...history].reverse().map((change) => (
        <div className="reschedule-history-row" key={change.changedAt + change.toStart}>
          <div><b>{weekLabel(change.fromStart)}</b><i aria-hidden="true">→</i><b>{weekLabel(change.toStart)}</b></div>
          <p>{change.reason}</p>
          <small>{change.changedBy} · {formatChangedAt(change.changedAt)}</small>
        </div>
      ))}
    </div>
  );
}
