'use client';

import type { CSSProperties } from 'react';
import { Button, Container, Figure } from '../../ui';
import { academicYearLabel, academicYearRangeLabel, months } from '../../org-data';
import { useToday } from '../context';

/**
 * The front door.
 *
 * The hero this replaces was a full `100vh` holding a pill, two lines and a
 * chevron — on a 1440×900 screen that is roughly 600px of empty gradient before
 * anything happens. It is shorter now, and the three figures that used to be
 * buried in the flow section further down have moved up into it, so the first
 * screen actually says what is inside the product.
 */
export default function HeroSection({
  parts,
  people,
  currentWorkCount,
  weekLoad,
  onAll,
}: {
  parts: number;
  people: number;
  currentWorkCount: number;
  weekLoad: number[];
  onAll: () => void;
}) {
  const peak = Math.max(1, ...weekLoad);
  const today = useToday();

  return (
    <section className="hero" id="top">
      <div className="hero-wash" aria-hidden="true" />
      <Container className="hero-inner">
        <div className="hero-copy">
          <p className="hero-pill">
            <span aria-hidden="true" />
            {academicYearLabel} · 교직원 업무 포털
          </p>
          <h1 className="hero-title">
            국제처 업무의 흐름을
            <br />
            <em>한 화면에서 관리합니다.</em>
          </h1>
          <p className="hero-lead">
            파트별 연간 일정부터 담당자별 준비사항, 다음 담당자를 위한 인수인계까지 한곳에서 확인하세요.
          </p>

          <div className="hero-actions">
            <Button variant="primary" size="lg" onClick={onAll} glyph="→">전체 업무 캘린더</Button>
            <a href="#start">파트별 업무 보기 <span aria-hidden="true">↓</span></a>
          </div>

          <dl className="hero-figures" aria-label="업무 현황 요약">
            <div>
              <dt>운영 파트</dt>
              <dd><Figure>{parts}</Figure><small>개</small></dd>
            </div>
            <div>
              <dt>담당자</dt>
              <dd><Figure>{people}</Figure><small>명</small></dd>
            </div>
            <div>
              <dt>이번 주 업무</dt>
              <dd><Figure>{currentWorkCount}</Figure><small>건</small></dd>
            </div>
          </dl>
        </div>

        <aside className="hero-preview" aria-label={`${academicYearLabel} 업무 밀도 미리보기`}>
          <header>
            <div>
              <span>연간 업무 현황</span>
              <strong>{academicYearRangeLabel}</strong>
            </div>
            <em><i aria-hidden="true" /> 운영 중</em>
          </header>

          <div className="hero-months" aria-hidden="true">
            {months.map((month) => <span key={month}>{month.replace('월', '')}</span>)}
          </div>
          <div className="hero-density" aria-hidden="true">
            {weekLoad.map((load, week) => (
              <i
                key={week}
                className={week === today.week ? 'current' : ''}
                style={{ '--load': Math.max(0.12, load / peak) } as CSSProperties}
              />
            ))}
            {/* The same this-week marker the calendars draw, at hero scale, so
                the front door is already speaking the product's language. */}
            {today.week !== null && (
              <span className="hero-now" style={{ '--week': today.week } as CSSProperties} />
            )}
          </div>

          <div className="hero-preview-rows">
            <div><span><i />파트별 일정</span><b>{parts}개 파트의 연간 흐름</b></div>
            <div><span><i />담당자 업무</span><b>{people}명의 역할과 준비사항</b></div>
            <div><span><i />인수인계</span><b>작성부터 검토까지 한곳에서</b></div>
          </div>
        </aside>
      </Container>
    </section>
  );
}
