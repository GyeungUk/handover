'use client';

import type { CSSProperties } from 'react';
import { Container, SectionHeading, Section } from '../../ui';
import { months, type Person, type Task, type Team } from '../../org-data';
import { useToday } from '../context';

/**
 * A compact, linear reading of the year. It deliberately uses the same
 * left-to-right time axis as the workspace calendars so the landing teaches
 * the product's visual language instead of introducing a decorative chart.
 *
 * The bars used to float over a plain ground with no scale on them: a reader
 * could see that March was taller than October and had no way to find out what
 * either height meant. There is an axis now, and the two things the copy
 * claims — the peak, and the weeks with nothing in them — are marked in the
 * chart rather than only stated beside it.
 */
type CurrentWorkItem = { team: Team; person: Person; task: Task };

export default function FlowSection({ weekLoad, currentWork, onPerson }: {
  weekLoad: number[];
  currentWork: CurrentWorkItem[];
  onPerson: (teamId: string, personId: string) => void;
}) {
  const peak = Math.max(1, ...weekLoad);
  const half = Math.round(peak / 2);
  const today = useToday();
  const currentLoad = today.week === null ? null : (weekLoad[today.week] ?? 0);
  const currentLabel = today.week === null
    ? '현재 학년도 일정 밖'
    : `${months[Math.floor(today.week / 4)]} ${(today.week % 4) + 1}주`;

  return (
    <Section className="flow-section" id="flow" aria-labelledby="flow-title">
      <Container>
        <SectionHeading
          eyebrow="이번 주 업무"
          title="이번 주, 누가 어떤 업무를 맡고 있나요?"
          titleId="flow-title"
          sub="현재 진행 중인 담당자와 업무를 확인하고, 연간 흐름 속 위치도 함께 살펴보세요."
          as="h2"
          align="start"
        />

        <div className="flow-panel reveal">
          <div
            className="flow-chart"
            role="img"
            aria-label={`파트별 연간 업무 밀도. ${currentLabel}${currentLoad === null ? '' : `에 ${currentLoad}명이 동시에 업무 중입니다.`}`}
          >
            <div className="flow-plot" aria-hidden="true">
              <div className="flow-axis">
                <span>{peak}</span>
                <span>{half}</span>
                <span>0</span>
              </div>

              <div className="flow-bars">
                <i className="flow-gridline" style={{ '--at': '0%' } as CSSProperties} />
                <i className="flow-gridline" style={{ '--at': '50%' } as CSSProperties} />
                {weekLoad.map((load, week) => (
                  <span
                    key={week}
                    className={`${load === 0 ? 'quiet' : ''} ${week === today.week ? 'current' : ''}`}
                    /* `--w` staggers the column's growth across the year, the same sweep the
                       hero's sparkline uses, so the two charts read as one family. */
                    style={{ '--w': week } as CSSProperties}
                  >
                    {/* Each column communicates only the total number of people working. Part
                        ownership belongs in the adjacent task list, so it does not compete with
                        the chart's year-over-year density reading. */}
                    {load === 0
                      ? <i className="flow-floor" />
                      : <i style={{ height: `${(load / peak) * 100}%` }} />}
                  </span>
                ))}
                {today.week !== null && (
                  <span className="flow-current-flag" style={{ '--week': today.week } as CSSProperties}>
                    오늘 · {currentLoad}명
                  </span>
                )}
              </div>

              <div className="flow-axis-foot" />
              <div className="flow-months">
                {months.map((month) => <span key={month}>{month}</span>)}
              </div>
            </div>

            <p className="flow-key" aria-label="그래프 범례">
              <span><i className="has-work" />업무 있음</span>
              <span><i className="this-week" />이번 주</span>
              <span><i className="no-work" />업무 없음</span>
              <em>세로 높이 = 동시 진행 인원</em>
            </p>
          </div>

          <aside className="current-work" aria-label={`${currentLabel} 담당 업무`}>
            <header className="current-work-head">
              <div>
                <span>{currentLabel}</span>
                <strong>진행 중인 업무</strong>
              </div>
              <b>{currentWork.length}건</b>
            </header>

            {currentWork.length > 0 ? (
              <ul className="current-work-list">
                {currentWork.map(({ team, person, task }) => (
                  <li
                    key={`${person.id}-${task.title}`}
                    style={{ '--team': team.color, '--soft': team.soft } as CSSProperties}
                  >
                    <button type="button" onClick={() => onPerson(team.id, person.id)} aria-label={`${task.title} · ${person.name} 담당자 페이지 열기`}>
                      <span className="current-work-avatar" aria-hidden="true">{person.initial}</span>
                      <div>
                        <p><strong>{person.name}</strong><small>{team.short} · {person.role}</small></p>
                        <b>{task.title}</b>
                      </div>
                      <span className="current-work-open" aria-hidden="true">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="current-work-empty">
                {today.week === null ? '현재 학년도 일정 밖입니다.' : '이번 주에 진행 중인 업무가 없습니다.'}
              </p>
            )}
          </aside>
        </div>
      </Container>
    </Section>
  );
}
