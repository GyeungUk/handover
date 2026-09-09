'use client';

import { useMemo } from 'react';
import { taskTrack, weeklyLoad } from '../../org-data';
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

  /* How many people are busy in each of the 48 weeks — this page's chart, and the only expensive
     thing on it. The year track's scrubber reads the same function, so the two agree. */
  const weekLoad = useMemo(() => weeklyLoad(teams.flatMap((team) => team.people)), [teams]);
  const peopleCount = useMemo(() => teams.reduce((sum, team) => sum + team.people.length, 0), [teams]);

  const currentWork = useMemo(() => {
    if (today.week === null) return [];
    return teams.flatMap((team) => team.people.flatMap((person) =>
      person.tasks
        .filter((task) => {
          const span = taskTrack(task);
          return today.week! >= span.start && today.week! < span.start + span.duration;
        })
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
