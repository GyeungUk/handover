'use client';

import { useEffect, useState } from 'react';

import { Button, Modal } from '../../ui';

/** Starts a new working year from the document that has already passed review. */
export default function ApprovedDraftModal({
  entryCount,
  bundleCount,
  reviewedAt,
  reviewedBy,
  canCreate,
  onStart,
  onOpen,
  onClose,
}: {
  entryCount: number;
  bundleCount: number;
  reviewedAt: string | null;
  reviewedBy: string | null;
  canCreate: boolean;
  onStart: () => Promise<void>;
  onOpen: (draftId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Array<{ id: string; sourceAcademicYear: number; entryCount: number; bundleCount: number; updatedAt: string; active: boolean }>>([]);
  const [listing, setListing] = useState(true);
  const reviewedOn = reviewedAt
    ? new Date(reviewedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    : '승인일 기록 없음';

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      await onStart();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '전년도 승인본을 불러오지 못했습니다.');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/handover/drafts');
        const data = await response.json() as { drafts?: typeof drafts; error?: string };
        if (!response.ok) throw new Error(data.error ?? '보관된 초안을 불러오지 못했습니다.');
        if (!cancelled) setDrafts(data.drafts ?? []);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : '보관된 초안을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setListing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const open = async (draftId: string) => {
    setStarting(true);
    setError('');
    try {
      await onOpen(draftId);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '선택한 초안을 열지 못했습니다.');
    } finally {
      setStarting(false);
    }
  };

  return <Modal
    onClose={onClose}
    width="md"
    dismissable={!starting}
    title="전년도 승인본으로 이번 학년도 초안 만들기"
    description="전년도 승인본을 바탕으로 이번 학년도 작업 초안을 여러 개 만들고, 필요할 때 다시 열 수 있습니다."
    footer={<>
      <Button onClick={onClose} disabled={starting}>취소</Button>
      <Button variant="primary" busy={starting} busyLabel="초안 만드는 중…" onClick={() => void start()} disabled={!canCreate}>
        이번 학년도 초안 만들기
      </Button>
    </>}
  >
    <div className="ho-approved-draft-source">
      <span className="ho-approved-draft-icon" aria-hidden="true">✓</span>
      <div>
        <b>이번 학년도 초안의 기준</b>
        <p>{reviewedOn}{reviewedBy ? ` · ${reviewedBy} 파트장 승인` : ''}</p>
      </div>
      <dl>
        <div><dt>담당업무 단위</dt><dd>{bundleCount}개</dd></div>
        <div><dt>인수인계 항목</dt><dd>{entryCount}개</dd></div>
      </dl>
    </div>
    <p className="ho-approved-draft-note"><span aria-hidden="true">ⓘ</span>새 초안을 만들어도 현재 작업본은 별도로 보관됩니다. 승인본은 지난 학년도 기록으로 유지됩니다.</p>
    {error && <p className="ho-draft-error" role="alert">{error}</p>}
    {listing && <p className="ho-approved-draft-note">보관된 초안을 불러오는 중입니다.</p>}
    {!listing && drafts.length > 0 && <section className="ho-approved-draft-list" aria-label="보관된 초안">
      <h3>보관된 초안</h3>
      {drafts.map((draft) => <button type="button" key={draft.id} disabled={starting || draft.active} onClick={() => void open(draft.id)}>
        <span><b>{draft.sourceAcademicYear}학년도 승인본 기준</b><small>최근 저장 {new Date(draft.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 업무 단위 {draft.bundleCount}개 · 항목 {draft.entryCount}개</small></span>
        <em>{draft.active ? '현재 열림' : '열기 →'}</em>
      </button>)}
    </section>}
  </Modal>;
}
