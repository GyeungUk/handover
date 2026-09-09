'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  Avatar,
  Empty,
  IconArchive,
  IconCalendarLines,
  IconPlus,
  IconSearch,
  Modal,
  Row,
  RowGroup,
  Text,
} from '../../ui';
import { taskLengthLabel, taskStartLabel, type Task } from '../../org-data';
import { useTeams } from '../context';

/**
 * One thing the reader can go to or do, whatever kind of thing it is.
 *
 * `key` is what React identifies a row by, `words` is what the query is matched against, and `run`
 * is what pressing it does. Everything below builds these and then stops caring which kind it was —
 * which is what lets one keyboard loop drive the whole list.
 */
type Hit = {
  kind: 'action' | 'team' | 'person' | 'task';
  key: string;
  words: string;
  run: () => void;
  render: (props: { id: string; selected: boolean }) => ReactNode;
};

const GROUP_LABELS: Record<Hit['kind'], string> = {
  action: '바로 실행',
  team: '파트',
  person: '담당자',
  task: '업무',
};
/* The order groups appear in, which is also the order the arrow keys walk. */
const GROUP_ORDER: Hit['kind'][] = ['action', 'team', 'person', 'task'];

/**
 * Search, and everything else ⌘K should be able to reach.
 *
 * It began as a person finder, then learned to find tasks. What it could not do was any of the
 * things a person opening it actually wanted next — open the year calendar, start a handover, add
 * a schedule — so those stayed four more places to point a mouse at, on a screen the reader had
 * just left to open this box. A command palette is the same box answering all of it: type nothing
 * and it offers the moves, type anything and it searches.
 *
 * The keyboard is the point. Focus stays in the field the whole time — arrow keys move a selection
 * rather than focus, `aria-activedescendant` tells a screen reader which option that is, and Enter
 * runs it. Moving real focus row to row would work for a mouse user and break the moment somebody
 * typed another letter.
 */
export default function SearchModal({
  onClose,
  onPerson,
  onTeam,
  onAll,
  onHandover,
  onAddTask,
}: {
  onClose: () => void;
  onPerson: (teamId: string, personId: string) => void;
  onTeam: (teamId: string) => void;
  onAll: () => void;
  onHandover: () => void;
  onAddTask: () => void;
}) {
  const teams = useTeams();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const everyone = useMemo(
    () => teams.flatMap((team) => team.people.map((person) => ({ team, person }))),
    [teams],
  );

  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();

  const hits = useMemo<Hit[]>(() => {
    /* Close first, then act. The other order leaves the dialog on screen for the frame it takes the
       new screen to mount, which reads as the palette failing to close. */
    const go = (run: () => void) => () => { onClose(); run(); };

    const actionRow = (key: string, title: string, sub: string, icon: ReactNode, run: () => void): Hit => ({
      kind: 'action',
      key: `action-${key}`,
      words: `${title} ${sub}`,
      run,
      render: ({ id, selected }) => (
        <Row
          id={id}
          role="option"
          selected={selected}
          className="search-action"
          title={title}
          sub={sub}
          leading={<span className="search-action-mark" aria-hidden="true">{icon}</span>}
          chevron="↵"
          onClick={run}
          ariaLabel={title}
        />
      ),
    });

    const actions: Hit[] = [
      actionRow('all', '국제처 전체 업무 캘린더', '연간 업무를 주 단위로 한눈에', <IconCalendarLines />, go(onAll)),
      actionRow('handover', '인수인계서 작성', '항목 작성부터 파트장 검토까지', <IconArchive />, go(onHandover)),
      actionRow('add', '새 일정 추가', '개인 또는 파트 일정을 등록', <IconPlus />, go(onAddTask)),
    ];

    const teamHits: Hit[] = teams.map((team) => {
      const open = go(() => onTeam(team.id));
      return {
        kind: 'team',
        key: `team-${team.id}`,
        words: `${team.title} ${team.short} ${team.english} ${team.description}`,
        run: open,
        render: ({ id, selected }) => (
          <Row
            id={id}
            role="option"
            selected={selected}
            title={team.title}
            sub={`${team.english} · 담당자 ${team.people.length}명`}
            leading={<span className="search-team-mark" style={{ '--team': team.color } as CSSProperties} aria-hidden="true">{team.mark}</span>}
            chevron="→"
            onClick={open}
            ariaLabel={`${team.title} 파트 캘린더 열기`}
          />
        ),
      };
    });

    const peopleHits: Hit[] = everyone.map(({ team, person }) => {
      const open = go(() => onPerson(team.id, person.id));
      return {
        kind: 'person',
        key: `person-${person.id}`,
        words: `${team.title} ${team.short} ${person.name} ${person.role}`,
        run: open,
        render: ({ id, selected }) => (
          <Row
            id={id}
            role="option"
            selected={selected}
            title={person.name}
            sub={`${team.title} · ${person.role}`}
            leading={<Avatar size="sm" color={team.color}>{person.initial}</Avatar>}
            chevron="→"
            onClick={open}
            ariaLabel={`${person.name} 담당자 페이지 열기`}
          />
        ),
      };
    });

    const taskHits: Hit[] = everyone.flatMap(({ team, person }) => person.tasks.map((task: Task) => {
      const open = go(() => onPerson(team.id, person.id));
      return {
        kind: 'task' as const,
        key: `task-${person.id}-${task.title}`,
        words: `${task.title} ${task.note} ${person.name} ${team.title}`,
        run: open,
        render: ({ id, selected }: { id: string; selected: boolean }) => (
          <Row
            id={id}
            role="option"
            selected={selected}
            className="search-task"
            title={task.title}
            sub={`${person.name} · ${team.title}`}
            leading={<span className="search-task-mark" style={{ '--team': team.color } as CSSProperties} aria-hidden="true" />}
            trailing={<em className="search-task-when">{taskStartLabel(task)} · {taskLengthLabel(task)}</em>}
            chevron="→"
            onClick={open}
            ariaLabel={`${task.title} 업무를 맡은 ${person.name} 담당자 페이지 열기`}
          />
        ),
      };
    }));

    /* Nothing typed: the three moves, then a few people to start from. A palette that opens empty
       is a palette nobody learns the contents of. */
    if (!needle) return [...actions, ...peopleHits.slice(0, 5)];

    const matched = [...actions, ...teamHits, ...peopleHits, ...taskHits]
      .filter((hit) => hit.words.toLowerCase().includes(needle));
    /* Grouped in a fixed order rather than in match order, so the list a reader learns the shape of
       does not rearrange itself under their fingers as they type. */
    return GROUP_ORDER.flatMap((kind) => matched.filter((hit) => hit.kind === kind)).slice(0, 14);
  }, [everyone, needle, teams, onAll, onHandover, onAddTask, onClose, onPerson, onTeam]);

  /*
   * A new query is a new list, and the selection belongs to the list rather than to the session.
   *
   * Adjusted during render rather than from an effect: an effect would paint one frame with the old
   * selection sitting on a row that is no longer there, and React re-renders immediately on a state
   * change made this way rather than committing the first pass. `activeFor` is the query the
   * current selection was made against, which is the only way to notice the change without one.
   */
  const [activeFor, setActiveFor] = useState(needle);
  if (activeFor !== needle) {
    setActiveFor(needle);
    setActive(0);
  }

  /*
   * Keep the selected option in view when the arrows walk past the fold, and do nothing at all when
   * it is already in view.
   *
   * `scrollIntoView` was the obvious call and the wrong one: it scrolls *every* scrollable ancestor,
   * so selecting the first row nudged the results box down far enough to hide the result count and
   * the first group heading — the palette opened looking like it had already been scrolled. This
   * measures the one box that should move and moves it only when it has to.
   */
  useEffect(() => {
    const row = listRef.current?.querySelector('.ui-row.is-active');
    const box = listRef.current?.closest('.ui-modal-body');
    if (!row || !box) return;
    const rowBox = row.getBoundingClientRect();
    const viewBox = box.getBoundingClientRect();
    const margin = 8;
    if (rowBox.top < viewBox.top) box.scrollTop -= viewBox.top - rowBox.top + margin;
    else if (rowBox.bottom > viewBox.bottom) box.scrollTop += rowBox.bottom - viewBox.bottom + margin;
  }, [active, hits]);

  const move = (delta: number) => setActive((current) => (
    hits.length ? (current + delta + hits.length) % hits.length : 0
  ));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return; }
    if (event.key === 'Home' && hits.length) { event.preventDefault(); setActive(0); return; }
    if (event.key === 'End' && hits.length) { event.preventDefault(); setActive(hits.length - 1); return; }
    if (event.key === 'Enter') {
      const hit = hits[active];
      if (!hit) return;
      event.preventDefault();
      hit.run();
    }
  };

  const optionId = (index: number) => `workspace-search-option-${index}`;
  /* Where each group starts, so a heading can be printed above its first row. */
  const groupStart = new Map<number, Hit['kind']>();
  hits.forEach((hit, index) => {
    if (index === 0 || hits[index - 1].kind !== hit.kind) groupStart.set(index, hit.kind);
  });

  return (
    <Modal
      onClose={onClose}
      width="md"
      className="search-modal"
      initialFocus="head"
      head={
        <div className="search-input">
          <h2 className="sr-only" id="workspace-search-title">통합 검색 및 바로 실행</h2>
          <IconSearch />
          <input
            autoFocus
            name="workspaceSearch"
            autoComplete="off"
            placeholder="예: 담당자 이름, 업무명, 인수인계…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="통합 검색 및 바로 실행"
            role="combobox"
            aria-expanded
            aria-controls="workspace-search-results"
            aria-activedescendant={hits.length ? optionId(active) : undefined}
            aria-autocomplete="list"
          />
          {/* `head` replaces the dialog's own header, and with it the × that every other
              modal closes by. That left a phone with an ESC hint for a key it does not
              have, and no way out but guessing that the strip above the sheet is tappable.
              The hint stays for the pointer; the button is what a thumb needs. */}
          <kbd>ESC</kbd>
          <button className="search-close" type="button" onClick={onClose} aria-label="검색 닫기">×</button>
        </div>
      }
      labelledBy="workspace-search-title"
    >
      <Text size="caption" tone="muted" className="search-count">
        {trimmed ? `검색 결과 ${hits.length}건` : '무엇을 할까요?'}
      </Text>

      {hits.length ? (
        <div ref={listRef}>
          <RowGroup className="search-results">
            <div id="workspace-search-results" role="listbox" aria-label="검색 결과">
              {hits.map((hit, index) => (
                <div key={hit.key} className="search-slot">
                  {groupStart.has(index) && (
                    <p className="search-group">{GROUP_LABELS[groupStart.get(index)!]}</p>
                  )}
                  {hit.render({ id: optionId(index), selected: index === active })}
                </div>
              ))}
            </div>
          </RowGroup>
        </div>
      ) : (
        <Empty
          glyph={<IconSearch />}
          /* No space before 에: a Korean particle binds to the word it marks,
             and the closing quote is part of that word. */
          title={`'${trimmed}'에 해당하는 결과가 없습니다.`}
          sub="담당자 이름, 역할, 업무명으로 다시 찾아보세요."
        />
      )}

      {/* The keys this box is driven by. Pointer-only readers never need them, and a phone has no
          keyboard to press them on, so the strip is hidden below 768px in the stylesheet. */}
      <p className="search-hint" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> 이동</span>
        <span><kbd>↵</kbd> 열기</span>
        <span><kbd>esc</kbd> 닫기</span>
      </p>
    </Modal>
  );
}
