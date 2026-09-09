'use client';

import { useMemo, type CSSProperties } from 'react';
import { Container, Stat } from '../../ui';
import { weeklyLoad } from '../../org-data';
import { useTeams } from '../context';
import { CalendarBody, WeekHeader } from '../calendar/WeekRuler';
import { PersonLoadRow } from '../calendar/rows';
import PersonTimelineCard from '../calendar/PersonTimelineCard';
import YearCalendar from '../calendar/YearCalendar';
import WorkspaceHead from './WorkspaceHead';
import YearPrintButton from './YearPrintButton';
import { SummaryBar } from './SummaryBar';

/**
 * Every part, every person, one year.
 *
 * The sidebar this replaces was an "org emblem" — a boxed monogram, a rule, a
 * part count and the word MEMBERS in tracked-out caps — occupying a full column
 * to say two numbers. The numbers are now a stat row above the calendar and the
 * column is gone, which is most of where the calendar's new width came from.
 */
export default function AllTeamsView({
  onHome,
  onTeam,
  onPerson,
}: {
  onHome: () => void;
  onTeam: (id: string) => void;
  onPerson: (teamId: string, personId: string) => void;
}) {
  const teams = useTeams();
  /* Feeds the week scrubber under the pointer; the same reading the landing's chart plots. */
  const busyByWeek = useMemo(() => weeklyLoad(teams.flatMap((team) => team.people)), [teams]);
  const memberCount = teams.reduce((sum, team) => sum + team.people.length, 0);
  const taskCount = teams.reduce((sum, team) => sum + team.people.reduce((n, person) => n + person.tasks.length, 0), 0);

  return (
    <main className="workspace-page">
      <WorkspaceHead
        crumbs={[{ label: '홈', onClick: onHome }, { label: '국제처 전체' }]}
        title="국제처 전체 업무 흐름"
        description={`${memberCount}명의 연간 업무 밀도를 주 단위로 한눈에 확인하세요.`}
        actions={<YearPrintButton scope={{ kind: 'office', teams }} />}
      />

      <Container>
        {/* The counts and the key belong to the same glance, so they are one
            strip rather than two cards with a gap between them. */}
        <SummaryBar
          aside={
            <div className="calendar-key">
              {teams.map((team) => (
                <span key={team.id}><i style={{ background: team.color }} />{team.title}</span>
              ))}
              <span className="calendar-key-now"><i />이번 주</span>
            </div>
          }
        >
          <Stat label="운영 파트" value={teams.length} unit="개" />
          <Stat label="담당자" value={memberCount} unit="명" />
          <Stat label="주요 업무" value={taskCount} unit="건" />
        </SummaryBar>

        <YearCalendar
          label="국제처 전체 연간 업무 일정표"
          wide={
            <section className="calendar-card overview-calendar">
              <CalendarBody busyByWeek={busyByWeek}>
                <WeekHeader lead="파트 / 담당자" />
                {teams.map((team) => (
                  <div className="overview-team" key={team.id} style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}>
                    <button className="team-strip" type="button" onClick={() => onTeam(team.id)}>
                      <span className="team-dot" style={{ '--team': team.color } as CSSProperties}>{team.mark}</span>
                      <span><b>{team.title}</b>{team.english && <small>{team.english}</small>}</span>
                      <span className="team-strip-count">
                        담당자 {team.people.length}명
                        <i aria-hidden="true" />
                        주요 업무 {team.people.reduce((sum, person) => sum + person.tasks.length, 0)}건
                      </span>
                      <em>파트로 보기</em>
                      <i aria-hidden="true">↗</i>
                    </button>
                    {team.people.map((person) => (
                      <PersonLoadRow key={person.id} person={person} color={team.color} onPerson={() => onPerson(team.id, person.id)} />
                    ))}
                  </div>
                ))}
              </CalendarBody>
            </section>
          }
          narrow={
            <div className="timeline-groups">
              {teams.map((team) => (
                <section className="timeline-group" key={team.id} style={{ '--team': team.color } as CSSProperties}>
                  <button className="timeline-group-head" type="button" onClick={() => onTeam(team.id)}>
                    <span className="team-dot" style={{ '--team': team.color } as CSSProperties}>{team.mark}</span>
                    <span><b>{team.title}</b><small>{team.people.length}명</small></span>
                    <i aria-hidden="true">›</i>
                  </button>
                  {team.people.map((person) => (
                    <PersonTimelineCard key={person.id} person={person} color={team.color} onPerson={() => onPerson(team.id, person.id)} />
                  ))}
                </section>
              ))}
            </div>
          }
        />
      </Container>
    </main>
  );
}
