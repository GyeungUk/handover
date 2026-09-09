'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Avatar, Badge, Button, Card, Container, IconPlus, IconRefresh, Stat } from '../../ui';
import { academicYearLabel, months, taskLengthLabel, taskStartLabel, taskTrack, weekLabel, weeklyLoad, SLOTS_PER_MONTH, type Person, type Task, type Team } from '../../org-data';
import { CalendarBody, WeekGrid, WeekHeader } from '../calendar/WeekRuler';
import { layoutTasks } from '../calendar/rows';
import PersonTimelineCard from '../calendar/PersonTimelineCard';
import YearCalendar from '../calendar/YearCalendar';
import MonthCalendar from './MonthCalendar';
import WorkspaceHead from './WorkspaceHead';
import YearPrintButton from './YearPrintButton';
import { SummaryBar, YearMeter } from './SummaryBar';
import { useToday } from '../context';

/** The person's own year track — every task, clickable straight into the month. */
function AnnualTrack({
  person,
  team,
  monthIndex,
  onTask,
}: {
  person: Person;
  team: Team;
  monthIndex: number;
  onTask: (task: Task, person: Person) => void;
}) {
  const { placed, lanes } = layoutTasks(person.tasks);
  return (
    <div
      className="person-year-track"
      style={{ '--lanes': lanes, '--row-pad': '14px', '--lane-h': '72px', '--bar-h': '64px' } as CSSProperties}
    >
      <div className="year-track-lead">
        <Avatar size="sm" color={team.color}>{person.initial}</Avatar>
        <span><b>{person.name}</b><small>총 {person.tasks.length}개 주요 업무</small></span>
      </div>
      <div className="task-timeline large-track">
        <WeekGrid />
        {placed.map(({ task, lane, inside, flipped, displayStart, displayDuration, drawn }) => {
          const taskMonth = Math.floor(drawn.start / SLOTS_PER_MONTH);
          return (
            <button
              className={`task-bar ${inside ? 'is-inside' : 'is-beside'} ${flipped ? 'is-flipped' : ''} ${taskMonth === monthIndex ? 'is-active' : ''} ${task.movedFrom !== undefined && !drawn.settled ? 'is-moved' : ''}`}
              key={`${task.title}-${task.start}`}
              style={{
                '--start': displayStart,
                '--duration': displayDuration,
                '--lane': lane,
                '--team': team.color,
                '--actual-width': `${(drawn.duration / displayDuration) * 100}%`,
              } as CSSProperties}
              type="button"
              onClick={() => onTask(task, person)}
              aria-label={`${task.title} 업무 상세 보기`}
              title={`${task.title} · 업무 상세 보기${task.movedFrom !== undefined && !drawn.settled ? ` (${weekLabel(task.movedFrom)}에서 변경됨)` : ''}`}
            >
              <span className="task-bar-fill" aria-hidden="true" />
              <span className="task-bar-label">
                {task.movedFrom !== undefined && !drawn.settled && <i className="moved-flag" aria-hidden="true"><IconRefresh /></i>}
                <b>{task.title}</b>
                {/* A settled task says the day it is on; only a task still planned in slots is
                    vague enough for the month alone to be the honest answer. */}
                <span>{task.period || drawn.settled ? taskStartLabel(task) : months[taskMonth]} · {taskLengthLabel(task)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One person's year and month.
 *
 * The hero this replaces stacked a breadcrumb, an avatar, a role pill, a name,
 * a sub-line and three stat blocks into a tinted slab that ran edge to edge with
 * negative margins — the one piece of the product that fought the page grid
 * instead of sitting in it.
 */
export default function PersonView({
  team,
  person,
  onHome,
  onAll,
  onTeam,
  onTask,
  onCalendarCheck,
  onAddTask,
}: {
  team: Team;
  person: Person;
  onHome: () => void;
  onAll: () => void;
  onTeam: () => void;
  onTask: (task: Task, person: Person) => void;
  onCalendarCheck: () => void;
  onAddTask: (monthIndex: number) => void;
}) {
  const today = useToday();
  const [monthIndex, setMonthIndex] = useState(0);
  const didSetCurrentMonth = useRef(false);
  const todayWeek = today.week;
  const orderedTasks = [...person.tasks].sort((a, b) => taskTrack(a).start - taskTrack(b).start);
  const nextTask = todayWeek === null
    ? orderedTasks[0]
    : orderedTasks.find((task) => {
      const span = taskTrack(task);
      return span.start + span.duration > todayWeek;
    });
  const nextTaskLabel = todayWeek === null
    ? '연간 첫 일정'
    : nextTask && taskTrack(nextTask).start <= todayWeek ? '진행 중인 일정' : '다음 일정';
  // Overlapping tasks occupy the same week only once.
  const busyWeeks = weeklyLoad([person]).filter(Boolean).length;

  /* `today` resolves after hydration. Open the personal calendar on that month
     once, then leave the user's month navigation alone. */
  useEffect(() => {
    if (didSetCurrentMonth.current || today.month === null) return;
    didSetCurrentMonth.current = true;
    setMonthIndex(today.month);
  }, [today.month]);

  return (
    <main className="workspace-page person-page" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
      <WorkspaceHead
        crumbs={[
          { label: '홈', onClick: onHome },
          { label: '국제처 전체', onClick: onAll },
          { label: team.title, onClick: onTeam },
          { label: person.name },
        ]}
        title={
          <span className="person-title">
            <Avatar size="lg" color={team.color}>{person.initial}</Avatar>
            {person.name}
          </span>
        }
        description={`${team.title} · ${academicYearLabel} 업무 캘린더`}
        actions={<YearPrintButton scope={{ kind: 'person', team, person }} label="담당 업무표 PDF" />}
      >
        <Badge tone="blue">{person.role}</Badge>
      </WorkspaceHead>

      <Container>
        <SummaryBar aside={<YearMeter busyWeeks={busyWeeks} color={team.color} label="업무가 있는 주" />}>
          <Stat label="주요 업무" value={person.tasks.length} unit="건" />
          <Stat
            label={nextTaskLabel}
            /* The month it is actually drawn in: a task whose day is confirmed is in that day's
               month, not in the one the loose plan happened to open in. */
            value={nextTask ? months[Math.floor(taskTrack(nextTask).start / SLOTS_PER_MONTH)] : '—'}
            hint={nextTask?.title ?? (person.tasks.length ? '이번 학년도 일정 완료' : '등록된 일정 없음')}
          />
        </SummaryBar>

        <Card tone="tint" tint="var(--tint-blue)" className="cal-check-cta" xl>
          <div>
            <b>학사일정 기준 일정 점검</b>
            <p>
              {person.tasks.length > 0
                ? '다음 학년도 학사일정과 비교해 옮겨야 할 업무와 그 시기를 제안합니다.'
                : '주요 업무가 등록되면 다음 학년도 학사일정과 비교할 수 있습니다.'}
            </p>
          </div>
          <Button variant="primary" onClick={onCalendarCheck} disabled={person.tasks.length === 0} glyph="→">일정 점검</Button>
        </Card>

        <section className="person-annual-section">
          <div className="section-bar">
            <h2 className="ui-h2">연간 일정</h2>
            <Button size="sm" variant="outline" leading={<IconPlus />} onClick={() => onAddTask(monthIndex)}>일정 추가</Button>
          </div>
          <YearCalendar
            label={`${person.name} 담당자 연간 업무 일정표`}
            wide={
              <div className="calendar-card person-annual">
                <CalendarBody>
                  <WeekHeader lead="연간 주요 업무" />
                  <AnnualTrack person={person} team={team} monthIndex={monthIndex} onTask={onTask} />
                </CalendarBody>
              </div>
            }
            narrow={
              <div className="timeline-groups">
                <PersonTimelineCard person={person} color={team.color} activeMonth={monthIndex} onTask={onTask} />
              </div>
            }
          />
        </section>

        <MonthCalendar
          person={person}
          monthIndex={monthIndex}
          setMonthIndex={setMonthIndex}
          onTask={onTask}
          action={<Button size="sm" variant="outline" leading={<IconPlus />} onClick={() => onAddTask(monthIndex)}>일정 추가</Button>}
        />
      </Container>
    </main>
  );
}
