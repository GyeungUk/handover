'use client';

import type { CSSProperties } from 'react';
import { Avatar, Badge, Button, Modal, Text } from '../../ui';
import { WEEKS_IN_YEAR, months, weekLabel, type Person, type Task, type Team } from '../../org-data';
import type { Reschedule, ScheduleChange } from '../types';
import { RescheduleForm, RescheduleHistory } from './RescheduleForm';
import TaskChecklist from './TaskChecklist';

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
  return (
    <div className="task-when-track" aria-hidden="true">
      {months.map((month, index) => (
        <span className="task-when-tick" key={month} style={{ '--month': index } as CSSProperties}>
          {month.replace('월', '')}
        </span>
      ))}
      {task.movedFrom !== undefined && (
        <i
          className="task-when-ghost"
          style={{ '--start': task.movedFrom, '--duration': task.duration } as CSSProperties}
        />
      )}
      <i className="task-when-bar" style={{ '--start': task.start, '--duration': task.duration } as CSSProperties} />
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
 * The body used to be four tinted boxes stacked on each other, one of which
 * held three more boxes. It is sections on the modal's own ground now, told
 * apart by their headings and by hairlines, which is what lets the one thing
 * that should look like a panel — the checklist — actually read as one.
 */
export default function TaskModal({
  task,
  person,
  team,
  history,
  onReschedule,
  onClose,
}: {
  task: Task;
  person: Person;
  team: Team;
  history: ScheduleChange[];
  onReschedule: Reschedule;
  onClose: () => void;
}) {
  const startMonth = months[Math.floor(task.start / 4)];
  const endWeek = Math.min(WEEKS_IN_YEAR - 1, task.start + task.duration - 1);
  const endMonth = months[Math.floor(endWeek / 4)];

  return (
    <Modal
      onClose={onClose}
      width="md"
      title={task.title}
      initialFocus="dialog"
      className="task-modal"
      footer={<>
        <p className="task-modal-footnote"><b>자동 저장</b><span>준비사항 변경은 즉시 반영됩니다.</span></p>
        <Button variant="primary" onClick={onClose}>닫기</Button>
      </>}
    >
      <div className="task-detail-flow" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
        <div className="task-detail-who">
          <Avatar size="sm" color={team.color}>{person.initial}</Avatar>
          <span className="who-copy"><b>{person.name}</b><small>{team.title} · {person.role}</small></span>
          {task.movedFrom !== undefined && <Badge tone="amber">일정 변경됨</Badge>}
        </div>

        <section className="task-when">
          <div className="task-when-head">
            <div><small>시작</small><b>{startMonth} {(task.start % 4) + 1}주</b></div>
            <i aria-hidden="true">→</i>
            <div><small>종료</small><b>{endMonth} {(endWeek % 4) + 1}주</b></div>
            <span className="task-when-length">{task.duration}주간</span>
          </div>
          <YearPosition task={task} />
          {task.movedFrom !== undefined && (
            <p className="task-when-moved">
              최초 계획 <b>{weekLabel(task.movedFrom)}</b> <i aria-hidden="true">→</i> 현재 <b>{weekLabel(task.start)}</b>
            </p>
          )}
        </section>

        <section className="task-brief">
          <h3>업무 개요</h3>
          <Text>{task.note}</Text>
        </section>

        <TaskChecklist key={`${person.id}::${task.title}`} task={task} person={person} />

        {/* Keyed on the start week so adopting a move resets the form to it. */}
        <RescheduleForm key={task.start} task={task} person={person} onReschedule={onReschedule} />

        <RescheduleHistory history={history} />
      </div>
    </Modal>
  );
}
