'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar, Button, Field, IconPlus, IconSearch, IconSettings, Input, Modal } from '../ui';
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
  onAddTask,
  onManageMembers,
  compact = false,
  handoverActive = false,
  handoverBackLabel = '캘린더로 돌아가기',
}: {
  user: SessionUser;
  onHome: () => void;
  /** Opens the handover screen, and on that screen goes back where it was opened from. */
  onHandover: () => void;
  onSearch: () => void;
  onAddTask: () => void;
  onManageMembers: () => void;
  compact?: boolean;
  handoverActive?: boolean;
  handoverBackLabel?: string;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
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

  function openDeleteAccount() {
    setProfileOpen(false);
    setDeletePassword('');
    setDeleteError('');
    setDeleteOpen(true);
  }

  function closeDeleteAccount() {
    if (!deleting) setDeleteOpen(false);
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deletePassword || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        setDeleteError(data?.error ?? '회원탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      window.location.replace('/');
    } catch {
      setDeleteError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <header className={`topbar ${compact ? 'compact' : ''} ${stuck ? 'is-stuck' : ''}`}>
        <button className="brand" type="button" onClick={onHome} aria-label="국제처 업무·인수인계 홈">
          <span className="brand-mark" aria-hidden="true"><span>SS</span><b>U</b></span>
          <span>
            <strong>국제처 업무·인수인계</strong>
            <small>SOONGSIL GLOBAL AFFAIRS</small>
          </span>
        </button>

        <div className="topbar-actions">
          <button className="icon-button search-compact" type="button" onClick={onSearch} aria-label="업무 또는 담당자 검색" title="검색 (⌘/Ctrl K)">
            <IconSearch />
          </button>

          <button className="search-button" type="button" onClick={onSearch}>
            <IconSearch />
            <span>업무 또는 담당자 검색</span>
            <kbd>⌘/Ctrl K</kbd>
          </button>

          <button className="add-task-button" type="button" onClick={onAddTask} aria-label="새 일정 추가" title="새 일정 추가">
            <IconPlus />
            <b>일정 추가</b>
          </button>

          {/* The one slot for the handover screen: the way in, and on that screen the way back.
              Narrow layouts hide the label and leave only the glyph, so the glyph turns around
              too — an unchanged ↗ would be the only thing a phone user saw. */}
          <button
            className={`handover-link ${handoverActive ? 'active' : ''}`}
            type="button"
            onClick={onHandover}
            aria-label={handoverActive ? handoverBackLabel : '인수인계 작성'}
            title={handoverActive ? handoverBackLabel : '인수인계 작성'}
          >
            <span aria-hidden="true">{handoverActive ? '←' : '↗'}</span>
            <b>{handoverActive ? handoverBackLabel : '인수인계 작성'}</b>
          </button>

          <div className="profile-wrap" ref={wrap}>
            <button
              className="profile"
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-expanded={profileOpen}
              aria-label={`${displayName} 계정 메뉴`}
              aria-haspopup="true"
            >
              <Avatar size="sm" round>{displayName.slice(0, 1).toUpperCase()}</Avatar>
              <span className="profile-copy">
                <strong>{displayName}</strong>
                <small>국제처 · {user.role === 'admin' ? '관리자' : '파트원'}</small>
              </span>
              <span className="chevron" aria-hidden="true">⌄</span>
            </button>

            {profileOpen && (
              <div className="profile-menu" aria-label="계정 메뉴">
                <div className="profile-menu-who">
                  <b>{displayName}</b>
                  <span>직번 {user.employeeId}</span>
                </div>
                {user.role === 'admin' && (
                  <button className="manage-members-button" type="button" onClick={() => { setProfileOpen(false); onManageMembers(); }}>
                    <IconSettings /> 파트 · 담당자 관리
                  </button>
                )}
                <button className="logout-button" type="button" onClick={signOut} disabled={signingOut}>
                  {signingOut ? '로그아웃 중…' : '로그아웃'}
                </button>
                <button className="delete-account-button" type="button" onClick={openDeleteAccount}>
                  회원탈퇴
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {deleteOpen && (
        <Modal
          onClose={closeDeleteAccount}
          title="회원탈퇴"
          description="계정을 영구적으로 삭제합니다."
          width="sm"
          dismissable={!deleting}
          stackFooter
          footer={<>
            <span className="spacer" />
            <Button variant="ghost" onClick={closeDeleteAccount} disabled={deleting}>취소</Button>
            <Button
              variant="danger"
              type="submit"
              form="delete-account-form"
              busy={deleting}
              busyLabel="탈퇴 중…"
              disabled={!deletePassword}
            >
              영구적으로 탈퇴
            </Button>
          </>}
        >
          <form id="delete-account-form" className="account-delete-form" onSubmit={deleteAccount}>
            <div className="account-delete-warning">
              <span aria-hidden="true">!</span>
              <div>
                <b>이 작업은 되돌릴 수 없습니다.</b>
                <p>계정, 모든 로그인 세션, 비밀번호 재설정 정보가 삭제됩니다. 처음 등록할 때 만든 담당자 프로필도 함께 삭제됩니다.</p>
              </div>
            </div>
            <Field
              label="현재 비밀번호"
              required
              hint="본인 확인을 위해 현재 비밀번호를 입력해 주세요."
              error={deleteError}
            >
              {(id) => (
                <Input
                  id={id}
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => { setDeletePassword(event.target.value); setDeleteError(''); }}
                  disabled={deleting}
                  aria-describedby={`${id}-${deleteError ? 'error' : 'hint'}`}
                  aria-invalid={Boolean(deleteError)}
                  placeholder="현재 비밀번호 입력…"
                />
              )}
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
