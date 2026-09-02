'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Modal, Select, Textarea } from '../../ui';
import { academicYearBounds, academicYearLabel, months, taskDateLabel, type Task, type Team } from '../../org-data';

/**
 * A task as this form submits it.
 *
 * `start`/`duration` are always sent — every task needs a slot on the 48-week track, and the form
 * has one selected either way. `startsOn`/`endsOn` are what make the task date-fixed: when they are
 * present the server derives the slots from them instead, so the two halves cannot be created
 * disagreeing about which month the task is in.
 */
export type CreatedTask = Task & { personId: string; startsOn?: string; endsOn?: string };

/** Which of the two a task is planned in. Most work is weeks; work with settled days is dates. */
type PlanMode = 'weeks' | 'dates';

export default function CreateTaskModal({
  teams,
  initialPersonId,
  onCreate,
  onClose,
}: {
  teams: Team[];
  initialPersonId?: string;
  onCreate: (input: CreatedTask) => Promise<void>;
  onClose: () => void;
}) {
  const firstPersonId = teams.flatMap((team) => team.people)[0]?.id ?? '';
  const [personId, setPersonId] = useState(initialPersonId || firstPersonId);
  const [title, setTitle] = useState('');
  const [month, setMonth] = useState(0);
  const [week, setWeek] = useState(0);
  const [duration, setDuration] = useState(1);
  const [mode, setMode] = useState<PlanMode>('weeks');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const start = month * 4 + week;
  const maxDuration = 48 - start;
  const datesReady = Boolean(startsOn && endsOn && endsOn >= startsOn);
  const ready = Boolean(personId) && Boolean(title.trim()) && (mode === 'dates' ? datesReady : duration <= maxDuration);

  const selectedPerson = (() => {
    for (const team of teams) {
      const person = team.people.find((candidate) => candidate.id === personId);
      if (person) return { team, person };
    }
    return null;
  })();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    try {
      await onCreate({
        personId,
        title: title.trim(),
        start,
        duration,
        note: note.trim(),
        ...(mode === 'dates' ? { startsOn, endsOn } : {}),
      });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '일정을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="새 일정 추가"
      description="담당자와 기간을 정하면 연간·월간 캘린더에 바로 반영됩니다."
      width="md"
      dismissable={!saving}
      stackFooter
      footer={<>
        <span className="spacer" />
        <Button variant="ghost" onClick={onClose} disabled={saving}>취소</Button>
        <Button
          variant="primary"
          type="submit"
          form="create-task-form"
          busy={saving}
          busyLabel="추가하는 중…"
          disabled={!ready}
        >
          일정 추가
        </Button>
      </>}
    >
      <form id="create-task-form" className="create-task-form" onSubmit={submit}>
        <Field label="담당자" required>
          {(id) => (
            <Select id={id} value={personId} onChange={(event) => setPersonId(event.target.value)} disabled={saving} required>
              {teams.map((team) => (
                <optgroup key={team.id} label={team.title}>
                  {team.people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>

        <Field label="일정명" required hint="담당자 안에서 구분되는 이름을 입력해 주세요." error={error}>
          {(id) => (
            <Input
              id={id}
              value={title}
              onChange={(event) => { setTitle(event.target.value); setError(''); }}
              maxLength={80}
              placeholder="예: 2학기 신입생 오리엔테이션"
              disabled={saving}
              required
              aria-describedby={`${id}-${error ? 'error' : 'hint'}`}
              aria-invalid={Boolean(error)}
            />
          )}
        </Field>

        {/* Weeks first, because most work is genuinely planned that way and offering dates as the
            default would invite a made-up precision into every new task. */}
        <div className="create-task-mode" role="group" aria-label="일정 계획 방식">
          <button
            type="button"
            className={mode === 'weeks' ? 'is-on' : ''}
            onClick={() => { setMode('weeks'); setError(''); }}
            disabled={saving}
            aria-pressed={mode === 'weeks'}
          >
            <b>주 단위로 계획</b>
            <small>아직 날짜가 정해지지 않은 업무</small>
          </button>
          <button
            type="button"
            className={mode === 'dates' ? 'is-on' : ''}
            onClick={() => { setMode('dates'); setError(''); }}
            disabled={saving}
            aria-pressed={mode === 'dates'}
          >
            <b>날짜로 확정</b>
            <small>시작·종료일이 정해진 업무</small>
          </button>
        </div>

        {mode === 'dates' ? (
          <div className="create-task-period is-dates" aria-label="확정 기간">
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
        ) : (
        <div className="create-task-period" aria-label="일정 기간">
          <Field label="시작 월" required>
            {(id) => (
              <Select id={id} value={month} onChange={(event) => { setMonth(Number(event.target.value)); setDuration(1); }} disabled={saving}>
                {months.map((label, index) => <option key={label} value={index}>{label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="시작 주" required>
            {(id) => (
              <Select id={id} value={week} onChange={(event) => { setWeek(Number(event.target.value)); setDuration(1); }} disabled={saving}>
                {[0, 1, 2, 3].map((index) => <option key={index} value={index}>{index + 1}주</option>)}
              </Select>
            )}
          </Field>
          <Field label="기간" required>
            {(id) => (
              <Select id={id} value={duration} onChange={(event) => setDuration(Number(event.target.value))} disabled={saving}>
                {Array.from({ length: Math.min(12, maxDuration) }, (_, index) => index + 1)
                  .map((value) => <option key={value} value={value}>{value}주</option>)}
              </Select>
            )}
          </Field>
        </div>
        )}

        <div className="create-task-preview">
          <span aria-hidden="true" style={{ background: selectedPerson?.team.color }} />
          <div>
            <b>
              {selectedPerson?.person.name ?? '담당자'} · {mode === 'dates'
                ? (datesReady ? `${taskDateLabel(startsOn)} ~ ${taskDateLabel(endsOn)}` : '시작일과 종료일을 선택해 주세요')
                : `${months[month]} ${week + 1}주부터 ${duration}주`}
            </b>
            <small>
              {mode === 'dates'
                ? `${academicYearLabel} 연간 일정에 확정 기간으로 등록됩니다.`
                : `${academicYearLabel} 연간 일정에 등록됩니다.`}
            </small>
          </div>
        </div>

        <Field label="업무 설명" hint="준비사항이나 일정의 목적을 적어 두면 인수인계할 때 유용합니다.">
          {(id) => (
            <Textarea
              id={id}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="업무 내용과 준비사항을 입력하세요."
              disabled={saving}
              aria-describedby={`${id}-hint`}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
