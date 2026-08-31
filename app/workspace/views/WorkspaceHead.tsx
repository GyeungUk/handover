'use client';

import type { ReactNode } from 'react';
import { Container, H1, Text } from '../../ui';

/**
 * The year the workspace is showing.
 *
 * It used to be flanked by a previous and a next arrow, both permanently
 * disabled — there is only one academic year in the product, so they were two
 * greyed controls that could never do anything, which reads as a screen that is
 * broken rather than as one that is complete. The scope is a statement now.
 */
export function CalendarScope({ label = '2026. 03 — 2027. 02' }: { label?: string }) {
  return (
    <div className="calendar-scope">
      <span className="calendar-scope-label">2026학년도</span>
      <strong>{label}</strong>
      <span className="today-chip">이번 주</span>
    </div>
  );
}

/**
 * The top of every workspace page: where you are, what you are looking at, and
 * the scope control.
 *
 * The breadcrumb is a real `<nav>` now. It used to be loose buttons and `<span>`
 * separators inside a div, so a screen reader read "홈 슬래시 유학생관리 슬래시
 * 박민서" as body text with no indication it was navigation.
 */
export default function WorkspaceHead({
  crumbs,
  title,
  description,
  scope = true,
  children,
}: {
  crumbs: { label: string; onClick?: () => void }[];
  title: ReactNode;
  description?: ReactNode;
  scope?: boolean;
  children?: ReactNode;
}) {
  return (
    <Container as="header" className="workspace-head">
      <div className="workspace-head-copy">
        <nav className="crumbs" aria-label="현재 위치">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`}>
              {index > 0 && <i aria-hidden="true">/</i>}
              {crumb.onClick
                ? <button type="button" onClick={crumb.onClick}>{crumb.label}</button>
                : <b aria-current="page">{crumb.label}</b>}
            </span>
          ))}
        </nav>
        <H1>{title}</H1>
        {description && <Text tone="muted">{description}</Text>}
        {children}
      </div>
      {scope && <CalendarScope />}
    </Container>
  );
}
