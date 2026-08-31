'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../ui';
import { useScrolled } from './context';
import type { SessionUser } from '../WorkspaceClient';

/**
 * The bar across the top of everything.
 *
 * Over the landing wash it has no surface of its own and grows one once the
 * page scrolls under it. The profile menu now closes on Escape and on a click
 * outside — it used to close only by pressing the same button again, so tapping
 * anywhere else left it hanging open over the page.
 */
export default function AppHeader({
  user,
  onHome,
  onHandover,
  onSearch,
  onManageMembers,
  compact = false,
  handoverActive = false,
}: {
  user: SessionUser;
  onHome: () => void;
  onHandover: () => void;
  onSearch: () => void;
  onManageMembers: () => void;
  compact?: boolean;
  handoverActive?: boolean;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const stuck = useScrolled();
  const displayName = user.displayName || user.email.split('@')[0];

  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setProfileOpen(false);
    const onPointer = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [profileOpen]);

  /* Dropping the session is the server's job; reloading is what puts the login screen back. */
  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.replace('/');
    }
  }

  return (
    <header className={`topbar ${compact ? 'compact' : ''} ${stuck ? 'is-stuck' : ''}`}>
      <button className="brand" type="button" onClick={onHome} aria-label="국제처 업무·인수인계 홈">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span>
          <strong>국제처 업무·인수인계</strong>
          <small>SOONGSIL GLOBAL AFFAIRS</small>
        </span>
      </button>

      <div className="topbar-actions">
        <button className="icon-button search-compact" type="button" onClick={onSearch} aria-label="통합 검색">
          <span aria-hidden="true">⌕</span>
        </button>

        <button className="search-button" type="button" onClick={onSearch}>
          <span aria-hidden="true">⌕</span>
          <span>업무 또는 담당자 검색</span>
          <kbd>⌘K</kbd>
        </button>

        <button className={`handover-link ${handoverActive ? 'active' : ''}`} type="button" onClick={onHandover}>
          <span aria-hidden="true">↗</span>
          <b>인수인계 작성</b>
        </button>

        <div className="profile-wrap" ref={wrap}>
          <button
            className="profile"
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
          >
            <Avatar size="sm" round>{displayName.slice(0, 1).toUpperCase()}</Avatar>
            <span className="profile-copy">
              <strong>{displayName}</strong>
              <small>국제처 · {user.role === 'admin' ? '관리자' : '파트원'}</small>
            </span>
            <span className="chevron" aria-hidden="true">⌄</span>
          </button>

          {profileOpen && (
            <div className="profile-menu" role="menu">
              <div className="profile-menu-who">
                <b>{displayName}</b>
                <span>직번 {user.employeeId}</span>
              </div>
              {user.role === 'admin' && (
                <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onManageMembers(); }}>
                  <span aria-hidden="true">⚙</span> 파트 · 담당자 관리
                </button>
              )}
              <button className="logout-button" type="button" role="menuitem" onClick={signOut} disabled={signingOut}>
                {signingOut ? '로그아웃 중…' : '로그아웃'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
