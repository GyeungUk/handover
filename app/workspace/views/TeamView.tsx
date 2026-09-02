'use client';

import type { CSSProperties } from 'react';
import { Button, Chip, ChipRail, Container, Stat } from '../../ui';
import type { Person, Task, Team } from '../../org-data';
import { useTeams } from '../context';
import { CalendarBody, WeekHeader } from '../calendar/WeekRuler';
import { PersonTaskRow } from '../calendar/rows';
import PersonTimelineCard from '../calendar/PersonTimelineCard';
import YearCalendar from '../calendar/YearCalendar';
import WorkspaceHead from './WorkspaceHead';
import { SummaryBar, YearMeter } from './SummaryBar';

/**
 * One part's year, with every task named.
 *
 * The part switcher is a `ChipRail`, so on a phone it scrolls sideways in place
 * of wrapping onto three lines — a five-part office wraps, and a growing one
 * wraps further.
 */
export default function TeamView({
  team,
  onHome,
  onAll,
  onTeam,
  onPerson,
  onTask,
  onAddTask,
}: {
  team: Team;
  onHome: () => void;
  onAll: () => void;
  onTeam: (id: string) => void;
  onPerson: (id: string) => void;
  onTask: (task: Task, person: Person) => void;
  onAddTask: () => void;
}) {
  const teams = useTeams();
  const busyWeeks = new Set(
    team.people.flatMap((person) => person.tasks.flatMap((task) => Array.from({ length: task.duration }, (_, i) => task.start + i))),
  ).size;
  const taskCount = team.people.reduce((sum, person) => sum + person.tasks.length, 0);

  return (
    <main className="workspace-page team-page" style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
      <WorkspaceHead
        crumbs={[{ label: '홈', onClick: onHome }, { label: '국제처 전체', onClick: onAll }, { label: team.title }]}
        title={team.title}
        description={team.description}
      />

      <Container>
        <ChipRail label="파트 전환">
          <Chip active={false} onClick={onAll}>전체</Chip>
          {teams.map((item) => (
            <Chip key={item.id} active={item.id === team.id} dot onClick={() => onTeam(item.id)} style={{ '--dot': item.color } as CSSProperties}>
              {item.short}
            </Chip>
          ))}
        </ChipRail>

        <SummaryBar aside={<YearMeter busyWeeks={busyWeeks} color={team.color} label="파트 업무가 있는 주" />}>
          <Stat label="담당자" value={team.people.length} unit="명" />
          <Stat label="주요 업무" value={taskCount} unit="건" />
        </SummaryBar>

        <section className="team-annual-section">
          <div className="section-bar">
            <h2 className="ui-h2">연간 일정</h2>
            <Button size="sm" variant="outline" glyph="＋" onClick={onAddTask}>파트 일정 추가</Button>
          </div>
          <YearCalendar
            label={`${team.title} 연간 업무 일정표`}
            wide={
              <section className="calendar-card team-calendar">
                <CalendarBody>
                  <WeekHeader lead="담당자 / 역할" />
                  {team.people.map((person) => (
                    <PersonTaskRow key={person.id} person={person} team={team} onPerson={() => onPerson(person.id)} onTask={onTask} />
                  ))}
                </CalendarBody>
              </section>
            }
            narrow={
              <div className="timeline-groups">
                {team.people.map((person) => (
                  <PersonTimelineCard
                    key={person.id}
                    person={person}
                    color={team.color}
                    onPerson={() => onPerson(person.id)}
                    onTask={onTask}
                  />
                ))}
              </div>
            }
          />
        </section>

        <section className="handover-note">
          <p>
            <b>파트 인수인계 포인트</b>
            업무 막대가 겹치는 시기는 파트 전체의 업무가 집중되는 구간입니다. 담당자를 눌러 세부 일정과 준비사항을 확인하세요.
          </p>
        </section>
      </Container>
    </main>
  );
}
