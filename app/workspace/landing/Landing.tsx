'use client';

import { useMemo } from 'react';
import { WEEKS_IN_YEAR } from '../../org-data';
import { useReveal, useTeams, useToday } from '../context';
import FlowSection from './FlowSection';
import HeroSection from './HeroSection';
import PartsSection from './PartsSection';
import SiteFooter from './SiteFooter';

/**
 * The landing, as four sections.
 *
 * It used to be one 100-line JSX block inside `WorkspaceClient` that computed
 * its own week load inline on every render. The arithmetic is memoised here and
 * each section is a file you can open on its own.
 */
export default function Landing({
  onAll,
  onTeam,
  onPerson,
}: {
  onAll: () => void;
  onTeam: (teamId: string) => void;
  onPerson: (teamId: string, personId: string) => void;
}) {
  const teams = useTeams();
  const today = useToday();

  /* How many people are busy in each of the 48 weeks — the flow ring's data,
     and the only expensive thing on this page. */
  const weekLoad = useMemo(() => {
    const people = teams.flatMap((team) => team.people);
    return Array.from({ length: WEEKS_IN_YEAR }, (_, week) =>
      people.filter((person) => person.tasks.some((task) => week >= task.start && week < task.start + task.duration)).length);
  }, [teams]);

  const peopleCount = useMemo(() => teams.reduce((sum, team) => sum + team.people.length, 0), [teams]);

  const currentWork = useMemo(() => {
    if (today.week === null) return [];
    return teams.flatMap((team) => team.people.flatMap((person) =>
      person.tasks
        .filter((task) => today.week! >= task.start && today.week! < task.start + task.duration)
        .map((task) => ({ team, person, task })),
    ));
  }, [teams, today.week]);

  useReveal([teams]);

  return (
    <>
      <main>
      <HeroSection
        parts={teams.length}
        people={peopleCount}
        currentWorkCount={currentWork.length}
        weekLoad={weekLoad}
        onAll={onAll}
      />
      <PartsSection teams={teams} totalPeople={peopleCount} onAll={onAll} onTeam={onTeam} onPerson={onPerson} />
      <FlowSection weekLoad={weekLoad} currentWork={currentWork} onPerson={onPerson} />
      </main>
      <SiteFooter />
    </>
  );
}
