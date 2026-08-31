import type { CSSProperties } from 'react';
import { Avatar, Card, Container, Row, RowGroup, SectionHeading, Section } from '../../ui';
import type { Team } from '../../org-data';

/**
 * Each card's ground is its own part's colour, at the strength a tint token
 * carries. It used to be a fixed cycle of five pastels, which meant a part's
 * card and everything else that part owns — its rows in the calendar, its bars,
 * its badge — could disagree about what colour it is, and a sixth part started
 * the cycle over.
 */
const tintOf = (color: string) => `color-mix(in srgb, ${color} 8%, #fff)`;

/**
 * Choosing where to start.
 *
 * The section this replaces was five cards that each carried a mark badge, an
 * arrow, an uppercase english eyebrow, a title, a description, a chip list and
 * a footer reading "3명 담당자" — seven layers to say a part exists and has
 * three people in it, without naming one of them. Getting to a person took
 * three clicks: part card, then the part page, then their row.
 *
 * So the people come to the surface. Each part is a tinted card whose right
 * half is its members as rows, which makes the names the thing you scan and
 * puts every person one click from the landing. The part header is still a
 * target of its own for anyone who wants the whole part's calendar.
 */
export default function PartsSection({
  teams,
  totalPeople,
  onAll,
  onTeam,
  onPerson,
}: {
  teams: Team[];
  totalPeople: number;
  onAll: () => void;
  onTeam: (teamId: string) => void;
  onPerson: (teamId: string, personId: string) => void;
}) {
  return (
    <Section className="parts-section" id="start" aria-labelledby="parts-title">
      <Container>
        <SectionHeading
          eyebrow="파트별 바로가기"
          title="담당 업무를 바로 확인하세요"
          sub="파트의 연간 흐름과 담당자별 세부 일정을 한 단계에서 바로 열 수 있습니다."
          as="h2"
          align="start"
          className="parts-heading"
        />

        {/* The whole office, kept apart from the parts: it is a different kind
            of destination, not a fifth part. */}
        <button className="parts-all" type="button" onClick={onAll}>
          <span className="parts-all-copy">
            <small>전체 현황</small>
            <b>국제처 연간 업무 캘린더</b>
            <span>{teams.length}개 파트, {totalPeople}명의 업무가 겹치는 시기를 주 단위로 확인합니다.</span>
          </span>
          <span className="parts-all-go" aria-hidden="true">→</span>
        </button>

        <div className="parts-grid">
          {teams.map((team, index) => (
            <Card
              key={team.id}
              tone="tint"
              tint={tintOf(team.color)}
              pad="none"
              xl
              className="part-card reveal"
              style={{ '--team': team.color, '--reveal-delay': `${index * 70}ms` } as CSSProperties}
            >
              <div className="part-card-head">
                <div>
                  {team.english && <p className="part-card-en">{team.english}</p>}
                  <h3 className="ui-h2">{team.title}</h3>
                  <p className="part-card-desc">{team.description}</p>
                </div>
                <button className="part-card-open" type="button" onClick={() => onTeam(team.id)}>
                  파트 전체 보기
                  <span aria-hidden="true">→</span>
                </button>
              </div>

              <RowGroup className="part-card-people">
                {team.people.map((person) => (
                  <Row
                    key={person.id}
                    title={person.name}
                    sub={person.role}
                    leading={<Avatar size="sm" color={team.color}>{person.initial}</Avatar>}
                    onClick={() => onPerson(team.id, person.id)}
                    ariaLabel={`${person.name} 담당자의 연간 일정 보기`}
                  />
                ))}
              </RowGroup>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
