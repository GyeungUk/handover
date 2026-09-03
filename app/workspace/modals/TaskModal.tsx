'use client';

import { useState, type CSSProperties } from 'react';
import { Avatar, Badge, Button, Modal, Text } from '../../ui';
import { WEEKS_IN_YEAR, confirmedDays, months, taskDateLabel, taskLengthLabel, taskTrack, weekLabel, type Person, type Task, type Team } from '../../org-data';
import type {
  AddTaskDate,
  AddTaskDates,
  ClearTaskPeriod,
  DeleteTask,
  RemoveTaskDate,
  Reschedule,
  ScheduleChange,
  SetTaskPeriod,
} from '../types';
import { RescheduleForm, RescheduleHistory } from './RescheduleForm';
import TaskChecklist from './TaskChecklist';
import TaskDates from './TaskDates';
import TaskPeriodSection from './TaskPeriod';

/**
 * Where this task sits in the year.
 *
 * The modal used to state the period as two figures in a tinted box — "3월 1주"
 * and "3월 4주" — which tells you when it starts and nothing about where that
 * is. This is the same 48-week track the calendar behind the modal is drawn on,
 * at modal scale, so the answer to "when is this, really" is one glance. A task
 * that has been moved keeps a ghost of where it used to sit.
 */
function YearPosition({ task }: { task: Task }) {
  /* The same reading the calendar behind the modal uses: once days are confirmed the bar sits on
     them, and the plan they were confirmed inside of is no longer drawn — including its ghost,
     since there is no week a task was "moved from" once the days are the record. */
  const drawn = taskTrack(task);
  return (
    <div className="task-when-track" aria-hidden="true">
      {months.map((month, index) => (
        <span className="task-when-tick" key={month} style={{ '--month': index } as CSSProperties}>
          {month.replace('월', '')}
        </span>
      ))}
      {task.movedFrom !== undefined && !drawn.settled && (
        <i
          className="task-when-ghost"
          style={{ '--start': task.movedFrom, '--duration': task.duration } as CSSProperties}
        />
      )}
      <i className="task-when-bar" style={{ '--start': drawn.start, '--duration': drawn.duration } as CSSProperties} />
    </div>
  );
}

/**
 * One task, in full.
 *
 * Now a `Modal`, which is where it picks up Escape, the focus trap and the
 * background scroll lock it never had — and, on a phone, becomes a sheet
 * instead of a dialog floating in the middle of a scrolled page.
 *
 * The body uses progressive disclosure for optional preparation checks, so the
 * default view stays focused on the task's owner, timing and summary.
 *
 * Deleting takes over the footer rather than opening a second dialog on top of
 * this one. The confirmation has to say what else goes with the task — the
 * reschedule trail and the saved checks are both in this modal, and both are
 * gone afterwards — and a dialog stacked over the one holding that evidence is
 * the wrong place to say it.
 */
export default function TaskModal({
  task,
  person,
  team,
  history,
  onReschedule,
  onDelete,
  onAddDate,
  onAddDates,
  onRemoveDate,
  onSetPeriod,
  onClearPeriod,
  onClose,
}: {
  task: Task;
  person: Person;
  team: Team;
  history: ScheduleChange[];
  onReschedule: Reschedule;
  onDelete: DeleteTask;
  onAddDate: AddTaskDate;
  onAddDates: AddTaskDates;
  onRemoveDate: RemoveTaskDate;
  onSetPeriod: SetTaskPeriod;
  onClearPeriod: ClearTaskPeriod;
  onClose: () => void;
}) {
  const startMonth = months[Math.floor(task.start / 4)];
  const endWeek = Math.min(WEEKS_IN_YEAR - 1, task.start + task.duration - 1);
  const endMonth = months[Math.floor(endWeek / 4)];
  /* Confirmed days replace the planned window as the answer to "when is this": the head states the
     days themselves, and the window they were chosen inside of stays in the 확정 일자 section below. */
  const settled = confirmedDays(task);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  /* The parent closes the modal once the delete lands, so there is no success state to return to. */
  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDelete(person.id, task.title);
    } catch (failure) {
      setDeleteError(failure instanceof Error ? failure.message : '일정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setDeleting(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      width="md"
      title={task.title}
      initialFocus="dialog"
      className="task-modal"
      dismissable={!deleting}
      footer={confirmingDelete ? (
        <>
          <p className="task-delete-confirm" role="alert">
            <b>{deleteError || `${task.title} 일정을 삭제할까요?`}</b>
            <span>일정 변경 기록과 확정 일자, 준비사항 체크도 함께 지워지며, 되돌릴 수 없습니다.</span>
          </p>
          <Button variant="ghost" onClick={() => { setConfirmingDelete(false); setDeleteError(''); }} disabled={deleting}>
            취소
          </Button>
          <Button variant="danger" onClick={remove} busy={deleting} busyLabel="삭제하는 중…">일정 삭제</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" className="task-delete-open" onClick={() => setConfirmingDelete(true)}>일정 삭제</Button>
          <Button variant="primary" className="task-modal-close-action" onClick={onClose}>닫기</Button>
        </>
      )}
    >
      <div className="task-detail-flow" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
        <div className="task-detail-who">
          <Avatar size="sm" color={team.color}>{person.initial}</Avatar>
          <span className="who-copy"><b>{person.name}</b><small>{team.title} · {person.role}</small></span>
          {task.movedFrom !== undefined && <Badge tone="amber">일정 변경됨</Badge>}
        </div>

        <section className="task-when">
          {settled.length ? (
            <div className="task-when-head">
              <div>
                <small>확정 일자</small>
                <b>{taskDateLabel(settled[0].date)}</b>
              </div>
              {settled.length > 1 && (
                <>
                  <i aria-hidden="true">→</i>
                  <div>
                    <small>마지막 확정</small>
                    <b>{taskDateLabel(settled[settled.length - 1].date)}</b>
                  </div>
                </>
              )}
              <span className="task-when-length">{taskLengthLabel(task)}</span>
            </div>
          ) : (
            <div className="task-when-head">
              <div>
                <small>시작</small>
                <b>{task.period ? taskDateLabel(task.period.startsOn) : `${startMonth} ${(task.start % 4) + 1}주`}</b>
              </div>
              <i aria-hidden="true">→</i>
              <div>
                <small>종료</small>
                <b>{task.period ? taskDateLabel(task.period.endsOn) : `${endMonth} ${(endWeek % 4) + 1}주`}</b>
              </div>
              <span className="task-when-length">{taskLengthLabel(task)}간</span>
            </div>
          )}
          <YearPosition task={task} />
          {task.movedFrom !== undefined && !settled.length && (
            <p className="task-when-moved">
              최초 계획 <b>{weekLabel(task.movedFrom)}</b> <i aria-hidden="true">→</i> 현재 <b>{weekLabel(task.start)}</b>
            </p>
          )}
        </section>

        <section className="task-brief">
          <h3>업무 개요</h3>
          <Text>{task.note}</Text>
        </section>

        {/* Before the confirmed days, because it answers the question they are recorded inside of:
            is this task's period a plan or a fact? */}
        <TaskPeriodSection task={task} person={person} onSet={onSetPeriod} onClear={onClearPeriod} />

        <TaskDates task={task} person={person} onAdd={onAddDate} onAddMany={onAddDates} onRemove={onRemoveDate} />

        <TaskChecklist key={`${person.id}::${task.title}`} task={task} person={person} />

        {/* Keyed on the start week so adopting a move resets the form to it. */}
        <RescheduleForm key={task.start} task={task} person={person} onReschedule={onReschedule} />

        <RescheduleHistory history={history} />
      </div>
    </Modal>
  );
}
