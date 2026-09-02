'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Avatar, Empty, Modal, Row, RowGroup, Text } from '../../ui';
import { taskLengthLabel, taskStartLabel, type Person, type Task, type Team } from '../../org-data';
import { useTeams } from '../context';

type Hit =
  | { kind: 'person'; team: Team; person: Person }
  | { kind: 'task'; team: Team; person: Person; task: Task };

/**
 * Finding a person or a task.
 *
 * A task used to match — the query was tested against the joined task titles —
 * but the result was still a person row, so searching "귀국보고회" answered with
 * "강유진" and no word about why. A task is a result of its own now: the work is
 * the title, the person and part are the sub-line, and the week it falls in is
 * on the right, which is what someone searching for a task wants to know.
 *
 * The results are `Row`s, so they look and behave like every other list in the
 * product. The empty state is a real one — the old modal simply rendered
 * nothing when a query matched nobody, which reads as a broken screen.
 */
export default function SearchModal({
  onClose,
  onPerson,
}: {
  onClose: () => void;
  onPerson: (teamId: string, personId: string) => void;
}) {
  const teams = useTeams();
  const [query, setQuery] = useState('');

  const everyone = useMemo(
    () => teams.flatMap((team) => team.people.map((person) => ({ team, person }))),
    [teams],
  );

  const trimmed = query.trim();
  const results = useMemo<Hit[]>(() => {
    if (!trimmed) return everyone.slice(0, 6).map(({ team, person }) => ({ kind: 'person', team, person }));
    const needle = trimmed.toLowerCase();
    const people = everyone
      .filter(({ team, person }) => `${team.title} ${person.name} ${person.role}`.toLowerCase().includes(needle))
      .map(({ team, person }) => ({ kind: 'person', team, person }) as Hit);
    const tasks = everyone.flatMap(({ team, person }) => person.tasks
      .filter((task) => `${task.title} ${task.note}`.toLowerCase().includes(needle))
      .map((task) => ({ kind: 'task', team, person, task }) as Hit));
    return [...people, ...tasks].slice(0, 10);
  }, [everyone, trimmed]);

  return (
    <Modal
      onClose={onClose}
      width="md"
      className="search-modal"
      initialFocus="head"
      head={
        <div className="search-input">
          <h2 className="sr-only" id="workspace-search-title">통합 검색</h2>
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            name="workspaceSearch"
            autoComplete="off"
            placeholder="예: 담당자 이름 또는 업무명…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="통합 검색"
          />
          <kbd>ESC</kbd>
        </div>
      }
      labelledBy="workspace-search-title"
    >
      <Text size="caption" tone="muted" className="search-count">
        {trimmed ? `검색 결과 ${results.length}건` : '빠른 탐색'}
      </Text>

      {results.length ? (
        <RowGroup>
          {results.map((hit) => hit.kind === 'person' ? (
            <Row
              key={`person-${hit.person.id}`}
              title={hit.person.name}
              sub={`${hit.team.title} · ${hit.person.role}`}
              leading={<Avatar size="sm" color={hit.team.color}>{hit.person.initial}</Avatar>}
              chevron="→"
              onClick={() => onPerson(hit.team.id, hit.person.id)}
              ariaLabel={`${hit.person.name} 담당자 페이지 열기`}
            />
          ) : (
            <Row
              key={`task-${hit.person.id}-${hit.task.title}`}
              className="search-task"
              title={hit.task.title}
              sub={`${hit.person.name} · ${hit.team.title}`}
              leading={<span className="search-task-mark" style={{ '--team': hit.team.color } as CSSProperties} aria-hidden="true" />}
              trailing={<em className="search-task-when">{taskStartLabel(hit.task)} · {taskLengthLabel(hit.task)}</em>}
              chevron="→"
              onClick={() => onPerson(hit.team.id, hit.person.id)}
              ariaLabel={`${hit.task.title} 업무를 맡은 ${hit.person.name} 담당자 페이지 열기`}
            />
          ))}
        </RowGroup>
      ) : (
        <Empty
          glyph="⌕"
          title={`'${trimmed}' 에 해당하는 결과가 없습니다`}
          sub="담당자 이름, 역할, 업무명으로 다시 찾아보세요."
        />
      )}
    </Modal>
  );
}
