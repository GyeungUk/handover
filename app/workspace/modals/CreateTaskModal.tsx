'use client';

import { useState, type CSSProperties, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Button, Field, Input, Modal, Select, Textarea } from '../../ui';
import {
  WEEKS_IN_YEAR,
  academicYearBounds,
  academicYearLabel,
  months,
  taskDateLabel,
  taskLengthLabel,
  taskStartLabel,
  weekOfDate,
  type Person,
  type Task,
  type Team,
} from '../../org-data';
import MonthCalendar from '../views/MonthCalendar';

/** One-person and one-team creates share the same payload; a team create names every target once. */
export type CreatedTask = Task & {
  personId?: string;
  personIds?: string[];
  startsOn?: string;
  endsOn?: string;
};

type PlanMode = 'weeks' | 'dates';
type TargetMode = 'person' | 'team';

function AnnualPreview({ person, team, draft }: { person: Person; team: Team; draft: Task }) {
  const tasks = [...person.tasks, draft];
  return (
    <section className="create-preview-section" aria-label={`${person.name} 연간 일정 미리보기`}>
      <div className="create-preview-title">
        <div><span>연간 일정</span><b>{academicYearLabel}</b></div>
        <small>현재 {person.tasks.length}건 · 추가 예정 1건</small>
      </div>
      <div className="create-year-months" aria-hidden="true">
        {months.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="create-year-rows">
        {tasks.map((task, index) => {
          const draftTask = index === tasks.length - 1;
          return (
            <div className={`create-year-row ${draftTask ? 'is-draft' : ''}`} key={`${task.title}-${task.start}-${index}`}>
              <span
                style={{
                  '--left': `${(task.start / WEEKS_IN_YEAR) * 100}%`,
                  '--width': `${(task.duration / WEEKS_IN_YEAR) * 100}%`,
                  '--team': team.color,
                  '--soft': team.soft,
                } as CSSProperties}
              >
                <b>{draftTask ? `＋ ${task.title}` : task.title}</b>
                <small>{draftTask ? '추가 예정' : taskLengthLabel(task)}</small>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TeamPreview({ team, draft, onOpenPerson }: { team: Team; draft: Task; onOpenPerson: (personId: string) => void }) {
  return (
    <section className="create-team-preview" aria-label={`${team.title} 파트 일정 적용 대상`}>
      <div className="create-preview-title">
        <div><span>파트 일정</span><b>{team.title}</b></div>
        <small>{team.people.length}명에게 동일하게 등록</small>
      </div>
      <div className="create-team-months" aria-hidden="true">
        <span>파트원별 연간 일정</span>
        <div>{months.map((label) => <i key={label}>{label}</i>)}</div>
      </div>
      <div className="create-team-targets">
        {team.people.map((person) => (
          <article key={person.id}>
            <button className="create-team-person-open" type="button" onClick={() => onOpenPerson(person.id)} aria-label={`${person.name} 담당자의 일정 크게 보기`}>
              <span className="create-target-avatar" style={{ background: team.color }}>{person.initial}</span>
              <p><b>{person.name}</b><small>{person.role} · 기존 {person.tasks.length}건</small></p>
              <span>크게 보기 <i aria-hidden="true">›</i></span>
            </button>
            <div className="create-person-schedules">
              {[draft, ...person.tasks].map((task, index) => {
                const isDraft = index === 0;
                return (
                  <div className={isDraft ? 'is-draft' : ''} key={`${task.title}-${task.start}-${index}`}>
                    <span><b>{isDraft ? `＋ ${task.title}` : task.title}</b><small>{isDraft ? '추가 예정' : `${taskStartLabel(task)} · ${taskLengthLabel(task)}`}</small></span>
                    <i title={`${task.title} · ${taskStartLabel(task)} · ${taskLengthLabel(task)}`}>
                      <em style={{ left: `${(task.start / WEEKS_IN_YEAR) * 100}%`, width: `${Math.max(2, (task.duration / WEEKS_IN_YEAR) * 100)}%`, background: team.color }} />
                    </i>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      <p className="create-team-note"><b>한 번의 저장으로 모두 반영됩니다.</b> 한 명에게라도 같은 이름의 일정이 있으면 아무에게도 등록하지 않습니다.</p>
    </section>
  );
}

function FocusedPartPersonPreview({
  person,
  team,
  draft,
  monthIndex,
  setMonthIndex,
  onBack,
}: {
  person: Person;
  team: Team;
  draft: Task;
  monthIndex: number;
  setMonthIndex: Dispatch<SetStateAction<number>>;
  onBack: () => void;
}) {
  const previewPerson = { ...person, tasks: [...person.tasks, draft] };
  return (
    <div className="create-focused-person">
      <div className="create-focused-nav">
        <small>파트원 일정 크게 보기</small>
        <button type="button" onClick={onBack}><span aria-hidden="true">←</span> 파트원 전체 일정</button>
      </div>
      <div className="create-preview-person">
        <span className="create-target-avatar" style={{ background: team.color }}>{person.initial}</span>
        <div><b>{person.name} 담당자의 일정</b><small>{team.title} · {person.role}</small></div>
      </div>
      <AnnualPreview person={person} team={team} draft={draft} />
      <div className="create-preview-month">
        <MonthCalendar person={previewPerson} monthIndex={monthIndex} setMonthIndex={setMonthIndex} />
      </div>
    </div>
  );
}

export default function CreateTaskModal({
  teams,
  initialPersonId,
  initialTeamId,
  initialMonth = 0,
  onCreate,
  onClose,
}: {
  teams: Team[];
  initialPersonId?: string;
  initialTeamId?: string;
  initialMonth?: number;
  onCreate: (input: CreatedTask) => Promise<void>;
  onClose: () => void;
}) {
  const firstPerson = teams.flatMap((team) => team.people)[0];
  const initialPersonTeam = teams.find((team) => team.people.some((person) => person.id === initialPersonId));
  const [targetMode, setTargetMode] = useState<TargetMode>(initialTeamId && !initialPersonId ? 'team' : 'person');
  const [personId, setPersonId] = useState(initialPersonId || firstPerson?.id || '');
  const [teamId, setTeamId] = useState(initialTeamId || initialPersonTeam?.id || teams[0]?.id || '');
  const [title, setTitle] = useState('');
  const [month, setMonth] = useState(initialMonth);
  const [previewMonth, setPreviewMonth] = useState(initialMonth);
  const [focusedPartPersonId, setFocusedPartPersonId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [week, setWeek] = useState(0);
  const [duration, setDuration] = useState(1);
  const [mode, setMode] = useState<PlanMode>('weeks');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const focusedPartPerson = selectedTeam?.people.find((person) => person.id === focusedPartPersonId) ?? null;
  const selectedPerson = teams.flatMap((team) => team.people.map((person) => ({ team, person })))
    .find((item) => item.person.id === personId) ?? null;
  const start = month * 4 + week;
  const maxDuration = WEEKS_IN_YEAR - start;
  const datesReady = Boolean(startsOn && endsOn && endsOn >= startsOn);
  const targetReady = targetMode === 'team' ? Boolean(selectedTeam?.people.length) : Boolean(selectedPerson);
  const ready = targetReady && Boolean(title.trim()) && (mode === 'dates' ? datesReady : duration <= maxDuration);
  const draftStart = mode === 'dates' && datesReady ? weekOfDate(startsOn) : start;
  const draftDuration = mode === 'dates' && datesReady
    ? Math.max(1, weekOfDate(endsOn) - draftStart + 1)
    : duration;
  const draft: Task = {
    title: title.trim() || '새 일정',
    start: draftStart,
    duration: draftDuration,
    note: note.trim(),
    ...(mode === 'dates' && datesReady ? { period: { startsOn, endsOn, setBy: '추가 예정' } } : {}),
  };
  const previewPerson = selectedPerson
    ? { ...selectedPerson.person, tasks: [...selectedPerson.person.tasks, draft] }
    : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    try {
      await onCreate({
        ...(targetMode === 'team'
          ? { personIds: selectedTeam!.people.map((person) => person.id) }
          : { personId }),
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
      description="개인 또는 파트를 선택하고, 기존 연간·월간 일정을 확인한 뒤 등록하세요."
      width="xl"
      className="create-task-modal"
      dismissable={!saving}
      stackFooter
      footer={<>
        <span className="create-task-foot-note">{targetMode === 'team' && selectedTeam ? `${selectedTeam.title} ${selectedTeam.people.length}명에게 등록됩니다.` : '선택한 담당자에게 등록됩니다.'}</span>
        <span className="spacer" />
        <Button variant="ghost" onClick={onClose} disabled={saving}>취소</Button>
        <Button variant="primary" type="submit" form="create-task-form" busy={saving} busyLabel="추가하는 중…" disabled={!ready}>
          {targetMode === 'team' && selectedTeam ? `${selectedTeam.people.length}명 일정 추가` : '일정 추가'}
        </Button>
      </>}
    >
      <div className="create-task-workspace">
        <form id="create-task-form" className="create-task-form" onSubmit={submit}>
          <div className="create-target-mode" role="group" aria-label="일정 등록 단위">
            <button type="button" className={targetMode === 'person' ? 'is-on' : ''} onClick={() => { setTargetMode('person'); setFocusedPartPersonId(null); setError(''); }} disabled={saving} aria-pressed={targetMode === 'person'}><b>개인 일정</b><small>담당자 1명에게 등록</small></button>
            <button type="button" className={targetMode === 'team' ? 'is-on' : ''} onClick={() => { setTargetMode('team'); setFocusedPartPersonId(null); setError(''); }} disabled={saving} aria-pressed={targetMode === 'team'}><b>파트 일정</b><small>파트원 전체에게 한 번에 등록</small></button>
          </div>

          {targetMode === 'person' ? (
            <Field label="담당자" required>
              {(id) => (
                <Select id={id} name="personId" value={personId} onChange={(event) => {
                  const nextPersonId = event.target.value;
                  setPersonId(nextPersonId);
                  const nextTeam = teams.find((team) => team.people.some((person) => person.id === nextPersonId));
                  if (nextTeam) setTeamId(nextTeam.id);
                  setError('');
                }} disabled={saving} required>
                  {teams.map((team) => <optgroup key={team.id} label={team.title}>{team.people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</optgroup>)}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="대상 파트" required hint={selectedTeam ? `${selectedTeam.people.map((person) => person.name).join(', ')}에게 동일한 일정이 생성됩니다.` : '파트를 선택해 주세요.'}>
              {(id) => <Select id={id} name="teamId" value={teamId} onChange={(event) => { setTeamId(event.target.value); setFocusedPartPersonId(null); setError(''); }} disabled={saving} required>{teams.map((team) => <option key={team.id} value={team.id}>{team.title} · {team.people.length}명</option>)}</Select>}
            </Field>
          )}

          <Field label="일정명" required hint="담당자별로 구분되는 이름을 입력해 주세요." error={error}>
            {(id) => <Input id={id} name="taskTitle" autoComplete="off" value={title} onChange={(event) => { setTitle(event.target.value); setError(''); }} maxLength={80} placeholder="예: 2학기 신입생 오리엔테이션…" disabled={saving} required aria-describedby={`${id}-${error ? 'error' : 'hint'}`} aria-invalid={Boolean(error)} />}
          </Field>

          <div className="create-task-mode" role="group" aria-label="일정 계획 방식">
            <button type="button" className={mode === 'weeks' ? 'is-on' : ''} onClick={() => { setMode('weeks'); setError(''); }} disabled={saving} aria-pressed={mode === 'weeks'}><b>주 단위로 계획</b><small>아직 날짜가 정해지지 않은 업무</small></button>
            <button type="button" className={mode === 'dates' ? 'is-on' : ''} onClick={() => { setMode('dates'); setError(''); }} disabled={saving} aria-pressed={mode === 'dates'}><b>날짜로 확정</b><small>시작·종료일이 정해진 업무</small></button>
          </div>

          {mode === 'dates' ? (
            <div className="create-task-period is-dates" aria-label="확정 기간">
              <Field label="시작일" required>{(id) => <Input id={id} name="startsOn" type="date" value={startsOn} min={academicYearBounds.from} max={academicYearBounds.to} onChange={(event) => { setStartsOn(event.target.value); setError(''); if (event.target.value) setPreviewMonth(Math.floor(weekOfDate(event.target.value) / 4)); }} disabled={saving} required />}</Field>
              <Field label="종료일" required>{(id) => <Input id={id} name="endsOn" type="date" value={endsOn} min={startsOn || academicYearBounds.from} max={academicYearBounds.to} onChange={(event) => { setEndsOn(event.target.value); setError(''); }} disabled={saving} required />}</Field>
            </div>
          ) : (
            <div className="create-task-period" aria-label="일정 기간">
              <Field label="시작 월" required>{(id) => <Select id={id} name="month" value={month} onChange={(event) => { const next = Number(event.target.value); setMonth(next); setPreviewMonth(next); setDuration(1); }} disabled={saving}>{months.map((label, index) => <option key={label} value={index}>{label}</option>)}</Select>}</Field>
              <Field label="시작 주" required>{(id) => <Select id={id} name="week" value={week} onChange={(event) => { setWeek(Number(event.target.value)); setDuration(1); }} disabled={saving}>{[0, 1, 2, 3].map((index) => <option key={index} value={index}>{index + 1}주</option>)}</Select>}</Field>
              <Field label="기간" required>{(id) => <Select id={id} name="duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} disabled={saving}>{Array.from({ length: Math.min(12, maxDuration) }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}주</option>)}</Select>}</Field>
            </div>
          )}

          <div className="create-task-preview">
            <span aria-hidden="true" style={{ background: targetMode === 'team' ? selectedTeam?.color : selectedPerson?.team.color }} />
            <div><b>{targetMode === 'team' ? selectedTeam?.title ?? '파트' : selectedPerson?.person.name ?? '담당자'} · {mode === 'dates' ? (datesReady ? `${taskDateLabel(startsOn)} ~ ${taskDateLabel(endsOn)}` : '시작일과 종료일을 선택해 주세요') : `${months[month]} ${week + 1}주부터 ${duration}주`}</b><small>{academicYearLabel} 연간 일정에 {targetMode === 'team' ? '파트 공통 일정으로 ' : ''}등록됩니다.</small></div>
          </div>

          <Field label="업무 설명" hint="준비사항이나 일정의 목적을 적어 두면 인수인계할 때 유용합니다.">
            {(id) => <Textarea id={id} name="taskNote" autoComplete="off" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={4} placeholder="예: 준비할 자료와 협업 부서…" disabled={saving} aria-describedby={`${id}-hint`} />}
          </Field>
          <button className="create-preview-toggle" type="button" aria-expanded={previewOpen} aria-controls="create-schedule-preview" onClick={() => setPreviewOpen((open) => !open)}>
            <span><b>일정 미리보기</b><small>저장 전에 연간·월간 위치를 확인할 수 있어요.</small></span>
            <i aria-hidden="true">{previewOpen ? '접기 ↑' : '보기 ↓'}</i>
          </button>
        </form>

        <aside id="create-schedule-preview" className={`create-schedule-preview ${previewOpen ? 'is-open' : ''}`} style={{ '--team': targetMode === 'team' ? selectedTeam?.color : selectedPerson?.team.color, '--soft': targetMode === 'team' ? selectedTeam?.soft : selectedPerson?.team.soft } as CSSProperties}>
          {targetMode === 'person' && selectedPerson && previewPerson ? <>
            <div className="create-preview-person"><span className="create-target-avatar" style={{ background: selectedPerson.team.color }}>{selectedPerson.person.initial}</span><div><b>{selectedPerson.person.name} 담당자의 일정</b><small>{selectedPerson.team.title} · {selectedPerson.person.role}</small></div></div>
            <AnnualPreview person={selectedPerson.person} team={selectedPerson.team} draft={draft} />
            <div className="create-preview-month"><MonthCalendar person={previewPerson} monthIndex={previewMonth} setMonthIndex={setPreviewMonth} /></div>
          </> : selectedTeam ? (focusedPartPerson ? (
            <FocusedPartPersonPreview
              person={focusedPartPerson}
              team={selectedTeam}
              draft={draft}
              monthIndex={previewMonth}
              setMonthIndex={setPreviewMonth}
              onBack={() => setFocusedPartPersonId(null)}
            />
          ) : <TeamPreview team={selectedTeam} draft={draft} onOpenPerson={setFocusedPartPersonId} />) : <p className="create-preview-empty">일정을 확인할 대상을 선택해 주세요.</p>}
        </aside>
      </div>
    </Modal>
  );
}
