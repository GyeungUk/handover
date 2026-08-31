'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Modal, Select, Textarea } from '../../ui';
import { months, type Task, type Team } from '../../org-data';

export type CreatedTask = Task & { personId: string };

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
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const start = month * 4 + week;
  const maxDuration = 48 - start;

  const selectedPerson = (() => {
    for (const team of teams) {
      const person = team.people.find((candidate) => candidate.id === personId);
      if (person) return { team, person };
    }
    return null;
  })();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!personId || !title.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await onCreate({ personId, title: title.trim(), start, duration, note: note.trim() });
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
          disabled={!personId || !title.trim() || duration > maxDuration}
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

        <div className="create-task-preview">
          <span aria-hidden="true" style={{ background: selectedPerson?.team.color }} />
          <div>
            <b>{selectedPerson?.person.name ?? '담당자'} · {months[month]} {week + 1}주부터 {duration}주</b>
            <small>2026학년도 연간 일정에 등록됩니다.</small>
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
