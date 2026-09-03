'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { documentLimits, isEditableStatus, type AnnualItem, type EntryAttachment, type EntryFormatting, type HandoverCategory, type HandoverDocument, type HandoverDocumentSummary, type HandoverEntry, type QualityResponse, type WorkBundle, type WorkflowStatus } from './handover-schema';
import { CategoryIcon, SaveIndicator, StatusBadge, type SaveState } from './handover/atoms';
import { categories, defaultFormatting, initialBundles, initialEntries } from './handover/categories';
import { plainText, sanitizeRichHtml, savePayload, snapshotOf } from './handover/format';
import EntryEditor from './handover/EntryEditor';
import BundleReadOnly from './handover/BundleReadOnly';
import EntryDetailModal from './handover/modals/EntryDetailModal';
import DraftModal from './handover/modals/DraftModal';
import ImportModal from './handover/modals/ImportModal';
import AnnualModal from './handover/modals/AnnualModal';

export type { HandoverCategory };
type WorkspaceTab = 'write' | 'compose' | 'review';

/** The shape every AI proposal boils down to before it becomes a real entry. */
type AdoptableItem = { category: HandoverCategory; title: string; detail: string; properties: Record<string, string> };

/** Every timestamp on this screen is read at a glance, so it is shown as a date, never as an instant. */
const onDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  : '';

const onDateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '';


export default function HandoverWorkspace({ onHome, origin, currentUser }: {
  onHome: () => void;
  /** The calendar this screen was opened from, when there was one, as a breadcrumb crumb. */
  origin?: { label: string; onOpen: () => void } | null;
  currentUser: { email: string };
}) {
  const [tab, setTab] = useState<WorkspaceTab>('write');
  const [activeCategory, setActiveCategory] = useState<HandoverCategory>('responsibility');
  const [entries, setEntries] = useState(initialEntries);
  const [bundles, setBundles] = useState(initialBundles);
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [role, setRole] = useState<'author' | 'manager'>('author');
  const [editor, setEditor] = useState<{ category: HandoverCategory; entry?: HandoverEntry } | null>(null);
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<{ bundleId: string; entryId: string } | null>(null);
  const [toast, setToast] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [annualOpen, setAnnualOpen] = useState(false);
  const [quality, setQuality] = useState<QualityResponse | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [viewerRole, setViewerRole] = useState<'admin' | 'member'>('member');
  const [ownerName, setOwnerName] = useState('');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveMessage, setSaveMessage] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [submittedDocuments, setSubmittedDocuments] = useState<HandoverDocumentSummary[]>([]);
  const [queueFilter, setQueueFilter] = useState<'all' | WorkflowStatus>('pending');
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [reviewedBy, setReviewedBy] = useState<string | null>(null);
  const [viewedOwnerEmail, setViewedOwnerEmail] = useState(currentUser.email.toLowerCase());
  const [fixedApprovedBundleIds, setFixedApprovedBundleIds] = useState<Set<string>>(() => new Set());
  const savedSnapshot = useRef<string | null>(null);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const annualRollover = useRef<Promise<void> | null>(null);
  const annualCycleReady = useRef(true);

  const assignedIds = useMemo(() => new Set(bundles.flatMap((bundle) => bundle.entryIds)), [bundles]);
  const approvedEntryIds = useMemo(
    () => new Set(bundles.filter((bundle) => bundle.decision === 'approved').flatMap((bundle) => bundle.entryIds)),
    [bundles],
  );
  const rejectedEntryIds = useMemo(
    () => new Set(bundles.filter((bundle) => bundle.decision === 'rejected').flatMap((bundle) => bundle.entryIds)),
    [bundles],
  );
  const unassignedEntries = entries.filter((entry) => !assignedIds.has(entry.id));
  const activeMeta = categories.find((category) => category.id === activeCategory)!;
  const canSubmit = bundles.length > 0 && entries.length > 0 && unassignedEntries.length === 0 && bundles.every((bundle) => bundle.entryIds.length > 0 && bundle.title.trim());
  /* A part leader loads someone else's document to review it, and every write here targets the
   * caller's own row — so a document that is only being read must never become editable. */
  const isOwnDocument = viewedOwnerEmail === currentUser.email.toLowerCase();
  const isLocked = !loaded || !isOwnDocument || status === 'pending' || status === 'approved';
  const isEntryLocked = (entryId: string) => isLocked || (status === 'rejected' && approvedEntryIds.has(entryId));
  const isBundleLocked = (bundle: WorkBundle) => isLocked || (status === 'rejected' && bundle.decision === 'approved');
  const detailBundle = detailView ? bundles.find((bundle) => bundle.id === detailView.bundleId) : undefined;
  const detailEntry = detailView ? entries.find((entry) => entry.id === detailView.entryId) : undefined;
  const reviewableBundles = bundles.filter((bundle) => !fixedApprovedBundleIds.has(bundle.id));
  /* An empty set is ready, not unready: an author who dropped every returned unit leaves a
   * resubmission whose units are all already approved, and the reviewer still has to close it. */
  const reviewReady = reviewableBundles.every((bundle) => bundle.decision && (bundle.decision === 'approved' || bundle.comment.trim()));
  const returnedBundles = status === 'rejected' ? bundles.filter((bundle) => bundle.decision === 'rejected') : [];
  const fixedBundleCount = bundles.length - returnedBundles.length;
  /* A correction round can only change what came back, so a finding on a frozen entry is a dead
   * end: the button under it opens an editor the author is not allowed to save. */
  const checkableEntries = status === 'rejected' ? entries.filter((entry) => !approvedEntryIds.has(entry.id)) : entries;
  /* The part leader's list is every submission, so the queue is the part of it still waiting. */
  const pendingDocuments = submittedDocuments.filter((item) => item.status === 'pending');
  const queueDocuments = queueFilter === 'all' ? submittedDocuments : submittedDocuments.filter((item) => item.status === queueFilter);
  const queueFilters: Array<{ id: 'all' | WorkflowStatus; label: string }> = [
    { id: 'pending', label: '검토 대기' },
    { id: 'rejected', label: '반려' },
    { id: 'approved', label: '승인 완료' },
    { id: 'all', label: '전체' },
  ];

  /* Both author steps carry this: the rule only makes sense where the locked controls are. */
  const rejectBanner = status === 'rejected' && <div className="ho-reject-banner"><span>!</span><div><b>반려된 업무 단위만 다시 작성할 수 있습니다.</b><p>{fixedBundleCount > 0
    ? `승인된 ${fixedBundleCount}개 단위와 그 안의 항목은 승인 상태로 고정되고, 반려된 ${returnedBundles.length}개 단위만 수정됩니다.`
    : `${returnedBundles.length}개 단위가 모두 보완 대상입니다. 단위별 코멘트를 확인하고 다시 작성해 주세요.`}</p></div><button type="button" onClick={() => setTab('review')}>검토 의견 보기</button></div>;

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  const applyDocument = useCallback((document: HandoverDocument) => {
    const safeEntries = document.entries.map((entry) => ({ ...entry, detail: sanitizeRichHtml(entry.detail) }));
    setEntries(safeEntries);
    setBundles(document.bundles);
    setFixedApprovedBundleIds(new Set(document.bundles.filter((bundle) => bundle.decision === 'approved').map((bundle) => bundle.id)));
    setStatus(document.status);
    setOwnerName(document.ownerName);
    setSubmittedAt(document.submittedAt);
    setReviewedAt(document.reviewedAt);
    setReviewedBy(document.reviewedBy);
    setSavedAt(document.updatedAt);
    annualCycleReady.current = document.status !== 'approved';
    savedSnapshot.current = snapshotOf(safeEntries, document.bundles);
    setSaveState('saved');
    setSaveMessage('');
  }, []);

  const persist = useCallback((nextEntries: HandoverEntry[], nextBundles: WorkBundle[]) => {
    const snapshot = snapshotOf(nextEntries, nextBundles);
    if (snapshot === savedSnapshot.current) return Promise.resolve(true);

    const save = async () => {
      /* A newer call may have queued the same state while this one was waiting. */
      if (snapshot === savedSnapshot.current) return true;
      setSaveState('saving');
      setSaveMessage('');
      try {
        const response = await fetch('/api/handover', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: savePayload(nextEntries, nextBundles) });
        const data = await response.json() as { document?: HandoverDocument; error?: string };
        if (!response.ok || !data.document) {
          setSaveState('error');
          setSaveMessage(data.error ?? '저장하지 못했습니다.');
          return false;
        }
        savedSnapshot.current = snapshot;
        setSavedAt(data.document.updatedAt);
        setSaveState('saved');
        return true;
      } catch {
        setSaveState('error');
        setSaveMessage('네트워크 오류로 저장하지 못했습니다.');
        return false;
      }
    };

    /* Whole-document saves must reach the server in edit order or a slow older response can win. */
    saveQueue.current = saveQueue.current.then(save, save);
    return saveQueue.current;
  }, []);

  const readDocument = useCallback(async (ownerEmail?: string) => {
    try {
      const query = ownerEmail ? `?owner=${encodeURIComponent(ownerEmail)}` : '';
      const response = await fetch(`/api/handover${query}`);
      const data = await response.json() as {
        document?: HandoverDocument | null;
        viewerRole?: 'admin' | 'member';
        submittedDocuments?: HandoverDocumentSummary[];
        error?: string;
      };
      if (!response.ok) {
        setSaveState('error');
        setSaveMessage(data.error ?? '저장된 인수인계서를 불러오지 못했습니다.');
        return null;
      }
      setViewerRole(data.viewerRole ?? 'member');
      setSubmittedDocuments(data.submittedDocuments ?? []);
      setViewedOwnerEmail((ownerEmail ?? currentUser.email).toLowerCase());
      if (data.document) {
        applyDocument(data.document);
      } else {
        setEntries([]);
        setBundles([]);
        setFixedApprovedBundleIds(new Set());
        setStatus('draft');
        setOwnerName('');
        setSubmittedAt(null);
        setReviewedAt(null);
        setReviewedBy(null);
        setSavedAt(null);
        savedSnapshot.current = snapshotOf([], []);
        setSaveState('saved');
        setSaveMessage('');
      }
      setLoaded(true);
      return data;
    } catch {
      setSaveState('error');
      setSaveMessage('네트워크 오류로 저장된 문서를 불러오지 못했습니다.');
      return null;
    }
  }, [applyDocument, currentUser.email]);

  /* An account with no saved document starts empty; demo content must never become real data. */
  useEffect(() => {
    const timer = window.setTimeout(() => { void readDocument(); }, 0);
    return () => window.clearTimeout(timer);
  }, [readDocument, loadAttempt]);

  /**
   * A waiting author watches for the verdict.
   *
   * The decision is made in the part leader's browser, so this screen only learns about it by
   * asking again: when the tab comes back to the front, and on a slow beat while it stays open. It
   * runs only while the author's own document is pending — nothing is editable then, so replacing
   * the state cannot lose an edit, and the moment the verdict lands the screen unlocks itself for
   * the correction round.
   */
  useEffect(() => {
    if (!loaded || role !== 'author' || !isOwnDocument || status !== 'pending') return;
    let checking = false;
    const check = async () => {
      if (checking || window.document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const data = await readDocument();
        const verdict = data?.document?.status;
        if (verdict === 'approved') flash('파트장이 인수인계서를 승인했습니다.');
        else if (verdict === 'rejected') flash('파트장이 보완을 요청했습니다. 반려된 단위를 다시 작성해 주세요.');
      } finally {
        checking = false;
      }
    };
    const onReturn = () => { void check(); };
    const timer = window.setInterval(onReturn, 20000);
    window.addEventListener('focus', onReturn);
    window.document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onReturn);
      window.document.removeEventListener('visibilitychange', onReturn);
    };
  }, [loaded, role, isOwnDocument, status, readDocument, flash]);

  /* Autosave. A submitted document is frozen, so there is nothing to send while it is under review. */
  useEffect(() => {
    if (!loaded || !isOwnDocument || !isEditableStatus(status)) return;
    if (snapshotOf(entries, bundles) === savedSnapshot.current) return;
    const timer = window.setTimeout(() => { void persist(entries, bundles); }, 1200);
    return () => window.clearTimeout(timer);
  }, [loaded, isOwnDocument, status, entries, bundles, persist]);

  useEffect(() => {
    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (!loaded || !isOwnDocument || !isEditableStatus(status) || snapshotOf(entries, bundles) === savedSnapshot.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnAboutUnsavedChanges);
    return () => window.removeEventListener('beforeunload', warnAboutUnsavedChanges);
  }, [loaded, isOwnDocument, status, entries, bundles]);

  const saveEntry = (title: string, detail: string, properties: Record<string, string>, formatting: EntryFormatting, attachments: EntryAttachment[]) => {
    if (!editor) return;
    if (editor.entry && isEntryLocked(editor.entry.id)) {
      setEditor(null);
      flash('승인된 항목은 수정할 수 없습니다.');
      return;
    }
    if (editor.entry) {
      setEntries((current) => current.map((entry) => entry.id === editor.entry?.id ? { ...entry, title, detail: sanitizeRichHtml(detail), properties, attachments, formatting } : entry));
      setQuality(null);
      flash('항목을 수정했습니다.');
    } else {
      const id = `${editor.category}-${crypto.randomUUID()}`;
      setEntries((current) => [...current, { id, category: editor.category, title, detail: sanitizeRichHtml(detail), properties, attachments, formatting }]);
      flash('새 항목을 추가했습니다.');
    }
    setEditor(null);
  };

  /* findings quote the text as it was checked, so any edit retires them */
  const runQualityCheck = async () => {
    setQualityLoading(true);
    setQualityError('');
    setQuality(null);
    try {
      const response = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: checkableEntries.map((entry) => ({ id: entry.id, category: entry.category, title: entry.title, text: plainText(entry.detail) })) }),
      });
      const data = await response.json() as QualityResponse & { error?: string };
      if (!response.ok) setQualityError(data.error ?? '점검에 실패했습니다.');
      else setQuality(data);
    } catch {
      setQualityError('네트워크 오류로 점검하지 못했습니다.');
    } finally {
      setQualityLoading(false);
    }
  };

  const editEntry = (entryId: string) => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    if (isEntryLocked(entryId)) {
      flash('승인된 항목은 수정할 수 없습니다.');
      return;
    }
    setActiveCategory(entry.category);
    setTab('write');
    setEditor({ category: entry.category, entry });
  };

  /** Drops an entry and every link to it. Whether that is allowed is the caller's question. */
  const dropEntry = (id: string) => {
    entries.find((entry) => entry.id === id)?.attachments.forEach((file) => URL.revokeObjectURL(file.url));
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setBundles((current) => current.map((bundle) => ({ ...bundle, entryIds: bundle.entryIds.filter((entryId) => entryId !== id) })));
    setQuality(null);
  };

  const removeEntry = (id: string) => {
    if (isEntryLocked(id)) {
      flash('승인된 항목은 삭제할 수 없습니다.');
      return;
    }
    dropEntry(id);
    flash('항목을 삭제했습니다.');
  };

  /** Every AI proposal — calendar draft, uploaded document, next-year update — lands here. */
  const adoptProposal = (item: AdoptableItem, message = '초안을 항목으로 추가했습니다.') => {
    const id = `${item.category}-${crypto.randomUUID()}`;
    setEntries((current) => [...current, { id, category: item.category, title: item.title, detail: sanitizeRichHtml(item.detail), properties: item.properties, attachments: [], formatting: defaultFormatting }]);
    setActiveCategory(item.category);
    setQuality(null);
    flash(message);
  };

  /** An approved document is immutable until the first annual change deliberately starts a new cycle. */
  const ensureAnnualDraft = async () => {
    if (status !== 'approved' || annualCycleReady.current) return;
    if (!annualRollover.current) {
      annualRollover.current = (async () => {
        const response = await fetch('/api/handover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'rollover' }),
        });
        const data = await response.json() as { document?: HandoverDocument; error?: string };
        if (!response.ok || !data.document) throw new Error(data.error ?? '다음 학년도 초안을 시작하지 못했습니다.');
        applyDocument(data.document);
        annualCycleReady.current = true;
        flash('다음 학년도 작성 상태로 전환했습니다.');
      })().finally(() => { annualRollover.current = null; });
    }
    await annualRollover.current;
  };

  /**
   * Applies one line of next year's draft: rewrite in place, add, or drop the entry.
   *
   * An approved document is locked everywhere else, but not here: starting next year's draft from
   * last year's approved one is the whole point of this step, and {@link ensureAnnualDraft} is what
   * unlocks it. What stays frozen is a unit approved during a correction round, which is waiting
   * for a review rather than for a new year.
   */
  const applyAnnual = async (item: AnnualItem) => {
    if (item.action === 'keep') return;
    const frozenForCorrection = !loaded || !isOwnDocument || status === 'pending'
      || (status === 'rejected' && item.entryId && approvedEntryIds.has(item.entryId));
    if (frozenForCorrection) {
      flash(status === 'pending' ? '검토 중에는 다음 학년도 초안을 반영할 수 없습니다.' : '승인된 항목은 다음 검토까지 고정됩니다.');
      return;
    }
    await ensureAnnualDraft();
    if (item.action === 'new' || !item.entryId) {
      adoptProposal(item, '이월 항목을 추가했습니다.');
      return;
    }
    if (item.action === 'archive') {
      /* The rollover above has just unlocked the document, but this render still remembers it as
       * approved — so remove the entry directly rather than through the guarded path. */
      dropEntry(item.entryId);
      flash('올해 문서에서 제외했습니다.');
      return;
    }
    setEntries((current) => current.map((entry) => entry.id === item.entryId
      ? { ...entry, title: item.title, detail: sanitizeRichHtml(item.detail), properties: item.properties }
      : entry));
    setActiveCategory(item.category);
    setQuality(null);
    flash('수정 내용을 반영했습니다.');
  };

  const addBundle = () => {
    const id = `bundle-${crypto.randomUUID()}`;
    setBundles((current) => [...current, { id, title: `새 담당업무 단위 ${current.length + 1}`, entryIds: [], decision: null, comment: '', previousComment: '' }]);
    setExpandedBundle(id);
  };

  const toggleEntry = (bundleId: string, entryId: string) => {
    const target = bundles.find((bundle) => bundle.id === bundleId);
    if (!target || isBundleLocked(target) || isEntryLocked(entryId)) return;
    setBundles((current) => current.map((bundle) => {
      if (bundle.id === bundleId) {
        const selected = bundle.entryIds.includes(entryId);
        return { ...bundle, entryIds: selected ? bundle.entryIds.filter((id) => id !== entryId) : [...bundle.entryIds, entryId] };
      }
      return { ...bundle, entryIds: bundle.entryIds.filter((id) => id !== entryId) };
    }));
  };

  /** Every workflow transition is decided by the server; the screen only reflects what came back. */
  const runAction = async (body: Record<string, unknown>, fallback: string) => {
    const response = await fetch('/api/handover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json() as { document?: HandoverDocument; error?: string };
    if (!response.ok || !data.document) {
      setSaveState('error');
      setSaveMessage(data.error ?? fallback);
      return null;
    }
    applyDocument(data.document);
    return data.document;
  };

  const submitHandover = async () => {
    if (!canSubmit || busy) return;
    const correcting = status === 'rejected';
    setBusy(true);
    try {
      /* the server validates what it has stored, so the pending autosave has to land first */
      if (!await persist(entries, bundles)) return;
      /* The queue this document just joined is refetched when the reviewer view opens, so there is
       * nothing to patch in here — see showManager. */
      if (!await runAction({ action: 'submit' }, '제출하지 못했습니다.')) return;
      setTab('review');
      setRole('author');
      flash(correcting ? '보완한 업무 단위를 다시 제출했습니다.' : '인수인계서를 제출했습니다.');
    } catch {
      setSaveState('error');
      setSaveMessage('네트워크 오류로 제출하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const completeReview = async () => {
    if (!reviewReady || busy) return;
    setBusy(true);
    try {
      const decisions = bundles
        .filter((bundle) => !fixedApprovedBundleIds.has(bundle.id))
        .map((bundle) => ({ bundleId: bundle.id, decision: bundle.decision, comment: bundle.comment }));
      const document = await runAction(
        { action: 'review', ownerEmail: viewedOwnerEmail, decisions },
        '검토 결과를 저장하지 못했습니다.',
      );
      if (!document) return;
      setRole('manager');
      flash(document.status === 'approved'
        ? `${ownerName || '작성자'}님의 인수인계서를 최종 승인했습니다.`
        : `${ownerName || '작성자'}님에게 검토 의견과 함께 반려했습니다.`);
      /* The verdict moved this document out of the queue and into the record, so the list beside it
       * is now wrong — reread it rather than patching the row out by hand. */
      await readDocument(viewedOwnerEmail);
    } catch {
      setSaveState('error');
      setSaveMessage('네트워크 오류로 검토 결과를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const reopenDraft = () => {
    setTab('write');
    flash('수정 모드로 전환했습니다.');
  };

  const showAuthor = (nextTab: WorkspaceTab = 'write') => {
    setRole('author');
    setTab(nextTab);
    if (viewedOwnerEmail !== currentUser.email.toLowerCase()) {
      setLoaded(false);
      void readDocument();
    }
  };

  /**
   * Opens the reviewer view on something worth reviewing.
   *
   * The queue is server state other people change by submitting, and it only ever arrives with a
   * read — so entering this view is the moment it has to be refetched rather than trusted. What
   * comes back also decides where to land: stay on the open document while it is still waiting,
   * otherwise take the first one that is.
   */
  const showManager = async () => {
    setRole('manager');
    setTab('review');
    setLoaded(false);
    const opened = await readDocument(viewedOwnerEmail);
    const waiting = (opened?.submittedDocuments ?? []).filter((item) => item.status === 'pending');
    if (opened?.document?.status !== 'pending' && waiting[0]) {
      setQueueFilter('pending');
      setLoaded(false);
      await readDocument(waiting[0].ownerEmail);
    }
  };

  /** Opens one submission from the list, whether it is still waiting or already decided. */
  const openSubmission = (ownerEmail: string) => {
    if (ownerEmail === viewedOwnerEmail && loaded) return;
    setLoaded(false);
    void readDocument(ownerEmail);
  };

  /* Composing is where a correction round is actually done, so the refusals this step provokes —
   * an edit to an approved unit above all — have to be readable there and not only on step one. */
  const saveBanner = saveState === 'error' && <div className="ho-save-banner" role="alert"><span>!</span><div><b>{loaded ? '변경 내용을 저장하지 못했습니다.' : '저장된 문서를 불러오지 못했습니다.'}</b><p>{saveMessage}</p></div><button type="button" onClick={() => loaded ? void persist(entries, bundles) : setLoadAttempt((attempt) => attempt + 1)}>{loaded ? '다시 저장' : '다시 불러오기'}</button></div>;

  return <main className="handover-workspace">
    {toast && <div className="ho-toast"><span>✓</span>{toast}</div>}
    <section className="ho-hero">
      <div className="ho-breadcrumb"><button type="button" onClick={onHome}>홈</button><span>/</span>{origin && <><button type="button" onClick={origin.onOpen}>{origin.label}</button><span>/</span></>}<small>인수인계</small></div>
      <div className="ho-hero-row"><div><h1>업무 인수인계서</h1><p>업무를 자유롭게 기록하고, 담당업무 단위로 묶어 완성하세요.</p></div><div className="ho-hero-actions"><SaveIndicator state={saveState} savedAt={savedAt} message={saveMessage} /><StatusBadge status={status} /><div className="ho-role-switch"><button type="button" className={role === 'author' ? 'active' : ''} onClick={() => showAuthor(tab)}>작성자</button><button type="button" className={role === 'manager' ? 'active' : ''} disabled={viewerRole !== 'admin'} title={viewerRole === 'admin' ? undefined : '파트장 계정으로 로그인해야 검토할 수 있습니다.'} onClick={() => { void showManager(); }}>파트장 검토</button></div></div></div>
      <div className="ho-progress"><button type="button" className={tab === 'write' ? 'active' : ''} onClick={() => showAuthor('write')}><i>1</i><span><b>항목 작성</b><small>{entries.length}개 기록됨</small></span></button><em /><button type="button" className={tab === 'compose' ? 'active' : ''} onClick={() => showAuthor('compose')}><i>2</i><span><b>업무 단위 조합</b><small>{bundles.length}개 단위</small></span></button><em /><button type="button" className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}><i>3</i><span><b>제출 및 승인</b><small>{status === 'draft' ? '제출 전' : status === 'pending' ? '검토 중' : status === 'rejected' ? '보완 필요' : '승인 완료'}</small></span></button></div>
    </section>

    {role === 'author' && tab === 'write' && <section className="ho-content ho-write-view">
      <div className="ho-section-title"><div><span className="ho-step">1단계</span><h2>인수인계 항목 작성</h2><p>순서에 관계없이 필요한 섹션부터 작성할 수 있습니다.</p></div><button type="button" onClick={() => setTab('compose')}>업무 단위 조합하기 <span>→</span></button></div>
      {saveBanner}
      {rejectBanner}
      <div className="ho-ai-panel">
        <div className="ho-ai-panel-head">
          <span className="ho-draft-spark" aria-hidden="true">✦</span>
          <div><b>AI 상세 초안 도우미</b><p>업무 개요에서 멈추지 않고 현황·절차·후속 조치·인계 포인트까지 구분해 정리합니다.</p></div>
          <em>채택 전까지 저장되지 않음</em>
        </div>
        <div className="ho-ai-cards">
          <button type="button" onClick={() => setImportOpen(true)} disabled={isLocked}>
            <span className="ho-ai-icon" aria-hidden="true">⇪</span>
            <b>기존 자료 업로드</b>
            <small>쓰고 있던 인수인계 문서를 올리면 담당업무·계획·현안·미결로 자동 분류합니다.</small>
            <em>파일 · 붙여넣기 <span aria-hidden="true">→</span></em>
          </button>
          <button type="button" onClick={() => setDraftOpen(true)} disabled={isLocked}>
            <span className="ho-ai-icon" aria-hidden="true">▤</span>
            <b>캘린더에서 초안</b>
            <small>연간 일정과 일정 변경 사유를 근거로 네 개 섹션의 초안을 제안합니다.</small>
            <em>일정 기록 기반 <span aria-hidden="true">→</span></em>
          </button>
          <button type="button" onClick={() => setAnnualOpen(true)} disabled={!loaded || status === 'pending'} title={status === 'pending' ? '파트장 검토가 끝난 후 다음 학년도 초안을 만들 수 있습니다.' : undefined}>
            <span className="ho-ai-icon" aria-hidden="true">↻</span>
            <b>연간 업데이트</b>
            <small>전년도 문서에서 해마다 달라지는 부분만 골라 올해 초안으로 갱신합니다.</small>
            <em>{entries.length}개 항목 기준 <span aria-hidden="true">→</span></em>
          </button>
        </div>
      </div>
      <div className="ho-category-tabs">{categories.map((category) => {
        const count = entries.filter((entry) => entry.category === category.id).length;
        return <button type="button" key={category.id} className={activeCategory === category.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)} style={{ '--category': category.accent, '--category-soft': category.soft } as React.CSSProperties}><span className="ho-category-icon"><CategoryIcon category={category.id} /></span><span><small>{category.step}</small><b>{category.short}</b><em>{count}개</em></span></button>;
      })}</div>
      <div className="ho-entry-panel" style={{ '--category': activeMeta.accent, '--category-soft': activeMeta.soft } as React.CSSProperties}>
        <div className="ho-entry-head"><div className="ho-category-icon large"><CategoryIcon category={activeMeta.id} /></div><div><span className="ho-step">{activeMeta.step}번 섹션</span><h3>{activeMeta.label}</h3><p>{activeMeta.description}</p></div><button type="button" onClick={() => setEditor({ category: activeMeta.id })} disabled={isLocked}><span>＋</span> 새 항목 추가</button></div>
        <div className="ho-entry-list">{entries.filter((entry) => entry.category === activeMeta.id).map((entry, index) => {
          const entryLocked = isEntryLocked(entry.id);
          const approvedFixed = entryLocked && status === 'rejected';
          const needsFix = status === 'rejected' && rejectedEntryIds.has(entry.id);
          return <article className={`${approvedFixed ? 'approved-fixed' : ''} ${needsFix ? 'needs-fix' : ''}`.trim()} key={entry.id}><span className="ho-entry-number">{String(index + 1).padStart(2, '0')}</span><div><h4>{entry.title}</h4><div className="ho-entry-property-row">{activeMeta.propertyFields.map((field) => entry.properties[field.key] && <span key={field.key}><b>{field.label}</b>{entry.properties[field.key]}</span>)}{entry.detail.includes('<table') && <span className="has-table"><b>문서</b>표 포함</span>}{entry.attachments.length > 0 && <span className="has-file"><b>첨부</b>{entry.attachments.length}개</span>}</div><p>{plainText(entry.detail)}</p><span className={`ho-linked ${approvedFixed ? 'approved' : needsFix ? 'returned' : ''}`}>{approvedFixed ? '✓ 승인 완료 · 수정 불가' : needsFix ? '↩ 반려됨 · 다시 작성' : assignedIds.has(entry.id) ? '업무 단위에 연결됨' : '아직 연결되지 않음'}</span></div><div className="ho-entry-actions"><button type="button" onClick={() => editEntry(entry.id)} disabled={entryLocked} aria-label={`${entry.title} 문서 편집`}>문서 편집</button><button type="button" onClick={() => removeEntry(entry.id)} disabled={entryLocked} aria-label={`${entry.title} 삭제`}>삭제</button></div></article>;
        })}{entries.every((entry) => entry.category !== activeMeta.id) && <div className="ho-empty"><div className="ho-category-icon"><CategoryIcon category={activeMeta.id} /></div><b>아직 작성된 항목이 없습니다.</b><p>{activeMeta.description}</p><button type="button" onClick={() => setEditor({ category: activeMeta.id })} disabled={isLocked}><span aria-hidden="true">＋</span> 첫 항목 작성하기</button></div>}</div>
      </div>
      <aside className="ho-writing-tip"><span>TIP</span><p>한 항목에는 하나의 주제를 적어두면, 최종 조합 단계에서 여러 담당업무 단위로 정리하기 쉽습니다.</p><div>{categories.map((category) => <span key={category.id}><i style={{ background: category.accent }} />{category.short}<b>{entries.filter((entry) => entry.category === category.id).length}</b></span>)}</div></aside>
    </section>}

    {role === 'author' && tab === 'compose' && <section className="ho-content ho-compose-view">
      <div className="ho-section-title"><div><span className="ho-step">2단계</span><h2>담당업무 단위 조합</h2><p>관련 항목을 묶어 하나의 완성된 인수인계 단위로 만드세요.</p></div><button type="button" className="outline" onClick={addBundle} disabled={isLocked}><span>＋</span> 새 업무 단위</button></div>
      {saveBanner}
      {rejectBanner}
      <div className="ho-compose-summary"><div><small>작성 항목</small><strong>{entries.length}</strong><span>개</span></div><i /><div><small>업무 단위</small><strong>{bundles.length}</strong><span>개</span></div><i />{status === 'rejected' && <><div className="warning"><small>반려된 단위</small><strong>{returnedBundles.length}</strong><span>개</span></div><i /></>}<div className={unassignedEntries.length ? 'warning' : 'done'}><small>미배치 항목</small><strong>{unassignedEntries.length}</strong><span>개</span></div><p>{unassignedEntries.length ? '모든 항목을 업무 단위에 배치해야 제출할 수 있습니다.' : status === 'rejected' ? '반려된 단위의 코멘트를 확인하고 그 단위만 다시 작성해 주세요.' : '모든 항목이 빠짐없이 연결되었습니다.'}</p></div>
      <div className="ho-bundle-list">{bundles.map((bundle, bundleIndex) => {
        const bundleLocked = isBundleLocked(bundle);
        const approvedFixed = status === 'rejected' && bundle.decision === 'approved';
        const needsFix = status === 'rejected' && bundle.decision === 'rejected';
        return <article className={`ho-bundle ${expandedBundle === bundle.id ? 'expanded' : ''} ${approvedFixed ? 'approved-fixed' : ''} ${needsFix ? 'needs-fix' : ''}`} key={bundle.id}>
        <div className="ho-bundle-head"><span className="ho-bundle-index">A-{String(bundleIndex + 1).padStart(2, '0')}</span><div><small>{approvedFixed ? '승인 완료 · 수정 불가' : needsFix ? '반려됨 · 다시 작성' : '담당업무 단위'}</small><input aria-label="담당업무 단위 이름" value={bundle.title} maxLength={documentLimits.bundleTitle} onChange={(event) => setBundles((current) => current.map((item) => item.id === bundle.id ? { ...item, title: event.target.value } : item))} disabled={bundleLocked} /></div><div className="ho-bundle-counts">{categories.map((category) => <span key={category.id} style={{ '--category': category.accent } as React.CSSProperties}><i />{bundle.entryIds.filter((id) => entries.find((entry) => entry.id === id)?.category === category.id).length}</span>)}</div>{approvedFixed && <b className="ho-fixed-badge">✓ 승인 고정</b>}{needsFix && <b className="ho-return-badge">↩ 보완 필요</b>}<button type="button" onClick={() => setExpandedBundle((current) => current === bundle.id ? null : bundle.id)}>{expandedBundle === bundle.id ? '접기' : approvedFixed ? '보기' : '편집'} <span>⌄</span></button></div>
        {needsFix && bundle.comment && <div className="ho-manager-comment"><span>파트장 코멘트</span><p>{bundle.comment}</p></div>}
        {expandedBundle === bundle.id && <div className="ho-bundle-body">{categories.map((category) => <div className="ho-pick-column" key={category.id} style={{ '--category': category.accent, '--category-soft': category.soft } as React.CSSProperties}><div><span className="ho-category-icon"><CategoryIcon category={category.id} /></span><b>{category.short}</b><em>{entries.filter((entry) => entry.category === category.id).length}개</em></div>{entries.filter((entry) => entry.category === category.id).map((entry) => {
          const selected = bundle.entryIds.includes(entry.id);
          const assignedElsewhere = !selected && bundles.some((item) => item.id !== bundle.id && item.entryIds.includes(entry.id));
          return <button type="button" key={entry.id} className={selected ? 'selected' : ''} disabled={bundleLocked || isEntryLocked(entry.id) || assignedElsewhere} onClick={() => toggleEntry(bundle.id, entry.id)}><i>{selected ? '✓' : ''}</i><span><b>{entry.title}</b>{assignedElsewhere && <small>다른 단위에 배치됨</small>}</span></button>;
        })}</div>)}</div>}
        {expandedBundle === bundle.id && !bundleLocked && <div className="ho-bundle-footer"><button type="button" onClick={() => { setBundles((current) => current.filter((item) => item.id !== bundle.id)); setExpandedBundle(null); }}>업무 단위 삭제</button><span>선택한 항목 <b>{bundle.entryIds.length}개</b></span></div>}
      </article>;
      })}{bundles.length === 0 && <div className="ho-empty-bundle"><b>아직 만들어진 담당업무 단위가 없습니다.</b><p>새 업무 단위를 만들고 작성한 항목을 자유롭게 조합해 주세요.</p><button type="button" onClick={addBundle}>＋ 첫 업무 단위 만들기</button></div>}</div>
      <div className="ho-quality">
        <div className="ho-quality-head">
          <span className="ho-quality-icon" aria-hidden="true">✓</span>
          <div><b>제출 전 점검</b><p>{status === 'rejected' ? `다시 작성할 수 있는 ${checkableEntries.length}개 항목만 점검합니다. 승인된 항목은 고쳐 쓸 수 없어 제외됩니다.` : '후임자가 이 문서만 보고 업무를 이어받을 수 있는지 확인합니다. 점검하지 않아도 제출할 수 있습니다.'}</p></div>
          <button type="button" onClick={runQualityCheck} disabled={qualityLoading || isLocked || !checkableEntries.length}>{qualityLoading ? '점검하는 중…' : quality ? '다시 점검' : '점검 실행'}</button>
        </div>
        {qualityError && <p className="ho-quality-error" role="alert">{qualityError}</p>}
        {quality && quality.findings.length === 0 && <p className="ho-quality-clear"><span aria-hidden="true">✓</span> {quality.checked}개 항목을 확인했고, 후임자가 막힐 만한 내용은 없었습니다.</p>}
        {quality && quality.findings.length > 0 && <>
          <div className="ho-quality-counts">
            <span className="high">보완 필요 <b>{quality.findings.filter((finding) => finding.severity === 'high').length}</b></span>
            <span className="low">확인 권장 <b>{quality.findings.filter((finding) => finding.severity === 'low').length}</b></span>
            <small>{quality.checked}개 항목 점검함</small>
          </div>
          <ul className="ho-quality-list">{quality.findings.map((finding) => {
            const entry = entries.find((item) => item.id === finding.entryId);
            const meta = entry ? categories.find((category) => category.id === entry.category) : undefined;
            return <li className={finding.severity} key={finding.id} style={meta ? { '--category': meta.accent, '--category-soft': meta.soft } as React.CSSProperties : undefined}>
              <div className="ho-finding-head">
                <span className="ho-finding-severity">{finding.severity === 'high' ? '보완 필요' : '확인 권장'}</span>
                <span className="ho-finding-kind">{finding.kind}</span>
                <small>{meta?.short} · {entry?.title ?? '삭제된 항목'}</small>
              </div>
              <p className="ho-finding-quote">“{finding.quote}”</p>
              <p className="ho-finding-message">{finding.message}</p>
              {finding.suggestion && <p className="ho-finding-suggestion"><b>보완</b>{finding.suggestion}</p>}
              {entry && <button type="button" onClick={() => editEntry(finding.entryId)}>이 항목 편집 <span aria-hidden="true">→</span></button>}
            </li>;
          })}</ul>
        </>}
      </div>
      <div className="ho-submit-bar"><div><span>{canSubmit ? '✓' : '!'}</span><p><b>{canSubmit ? status === 'rejected' ? '보완한 내용을 다시 제출할 수 있습니다.' : '제출 준비가 완료되었습니다.' : '아직 제출할 수 없습니다.'}</b><small>{canSubmit ? status === 'rejected' ? `보완한 ${returnedBundles.length}개 단위만 다시 검토받습니다.` : `${bundles.length}개 담당업무 단위 · 총 ${entries.length}개 항목` : '미배치 항목과 비어 있는 업무 단위를 확인해 주세요.'}</small></p></div><button type="button" disabled={!canSubmit || isLocked || busy} onClick={submitHandover}>{busy ? '제출하는 중…' : status === 'pending' ? '검토 대기 중' : status === 'approved' ? '승인 완료' : status === 'rejected' ? '보완분 다시 제출' : '파트장에게 제출'} <span>→</span></button></div>
    </section>}

    {tab === 'review' && <section className="ho-content ho-review-view">
      <div className="ho-section-title"><div><span className="ho-step">3단계</span><h2>{role === 'manager' ? '인수인계 검토' : '제출 및 승인 현황'}</h2><p>{role === 'manager' ? '담당업무 단위별로 승인하거나 보완 의견을 남겨 주세요.' : '파트장 검토 상태와 업무 단위별 의견을 확인하세요.'}</p></div>{role === 'author' && status === 'pending' && viewerRole === 'admin' && <button className="outline" type="button" onClick={() => { void showManager(); }}>파트장 검토 화면 보기 <span>→</span></button>}</div>
      {role === 'manager' && viewerRole === 'admin' && <div className="ho-review-queue">
        <div className="ho-queue-head">
          <div><span>제출된 인수인계서</span><b>{submittedDocuments.length}건</b><em>검토 대기 {pendingDocuments.length}건</em></div>
          <div className="ho-queue-filters" role="tablist">{queueFilters.map((filter) => {
            const count = filter.id === 'all' ? submittedDocuments.length : submittedDocuments.filter((item) => item.status === filter.id).length;
            return <button type="button" role="tab" aria-selected={queueFilter === filter.id} key={filter.id} className={queueFilter === filter.id ? 'active' : ''} onClick={() => setQueueFilter(filter.id)}>{filter.label}<b>{count}</b></button>;
          })}</div>
          <button type="button" className="ho-queue-refresh" onClick={() => { void readDocument(viewedOwnerEmail); }}>새로고침</button>
        </div>
        {queueDocuments.length > 0
          ? <ul className="ho-queue-list">{queueDocuments.map((item) => <li key={item.ownerEmail}>
              <button type="button" className={item.ownerEmail === viewedOwnerEmail ? 'active' : ''} aria-current={item.ownerEmail === viewedOwnerEmail} onClick={() => openSubmission(item.ownerEmail)}>
                <span className="ho-queue-who"><b>{item.ownerName || item.ownerEmail}</b><small>{item.ownerEmail}</small></span>
                <StatusBadge status={item.status} />
                <span className="ho-queue-when">{item.status === 'pending'
                  ? <>제출 {onDateTime(item.submittedAt ?? item.updatedAt)}</>
                  : <>{item.status === 'approved' ? '승인' : '반려'} {onDateTime(item.reviewedAt ?? item.updatedAt)}{item.reviewedBy ? ` · ${item.reviewedBy}` : ''}</>}</span>
                <span className="ho-queue-open" aria-hidden="true">→</span>
              </button>
            </li>)}</ul>
          : <p>{queueFilter === 'pending' ? '현재 검토를 기다리는 문서가 없습니다.' : '해당하는 제출물이 없습니다.'}</p>}
      </div>}
      {status === 'draft' && <div className="ho-review-empty"><div>3</div><span>제출 대기</span><h3>아직 제출된 인수인계서가 없습니다.</h3><p>항목을 업무 단위로 조합한 뒤 파트장에게 제출해 주세요.</p><button type="button" onClick={() => { setRole('author'); setTab('compose'); }}>조합 화면으로 이동 <span>→</span></button></div>}
      {status !== 'draft' && <>
        <div className={`ho-review-banner ${status}`}><div className="ho-review-symbol">{status === 'pending' ? '⌛' : status === 'approved' ? '✓' : '!'}</div><div><h3>{status === 'pending'
          ? (role === 'manager' ? '검토할 인수인계서가 도착했습니다.' : '파트장 검토를 기다리고 있습니다.')
          : status === 'approved'
            ? (role === 'manager' ? '이미 승인 처리한 인수인계서입니다.' : '인수인계서가 승인되었습니다.')
            : (role === 'manager' ? '보완을 요청한 인수인계서입니다.' : '보완 후 다시 제출해 주세요.')}</h3><p>{status === 'pending'
          ? `담당업무 ${bundles.length}개 단위 · 총 ${entries.length}개 항목`
          : status === 'approved'
            ? `${reviewedBy ? `${reviewedBy} 파트장이 ` : ''}${reviewedAt ? `${onDate(reviewedAt)}에 ` : ''}승인해 인수인계가 정상 처리되었습니다.`
            : `${reviewedBy ? `${reviewedBy} 파트장이 ` : ''}${reviewedAt ? `${onDate(reviewedAt)}에 ` : ''}반려했습니다. 반려된 담당업무 단위의 코멘트를 확인하고 내용을 수정할 수 있습니다.`}</p></div><StatusBadge status={status} /></div>
        <div className="ho-review-layout"><div className="ho-review-bundles">{bundles.map((bundle, index) => <article className={`ho-review-card ${bundle.decision ?? ''}`} key={bundle.id}>
          <div className="ho-review-card-head"><span>A-{String(index + 1).padStart(2, '0')}</span><div><small>담당업무 단위</small><h3>{bundle.title}</h3></div><div>{categories.map((category) => <span key={category.id} style={{ '--category': category.accent } as React.CSSProperties}><i />{bundle.entryIds.filter((id) => entries.find((entry) => entry.id === id)?.category === category.id).length}</span>)}</div>{bundle.decision && <b className={bundle.decision}>{bundle.decision === 'approved' ? '승인' : '반려'}</b>}</div>
          <BundleReadOnly bundle={bundle} entries={entries} onOpenEntry={(entryId) => setDetailView({ bundleId: bundle.id, entryId })} />
          {status === 'pending' && bundle.previousComment && <div className="ho-manager-comment previous"><span>지난 검토에서 요청한 보완</span><p>{bundle.previousComment}</p></div>}
          {role === 'manager' && status === 'pending' && !fixedApprovedBundleIds.has(bundle.id) && <div className="ho-manager-decision"><div><span>검토 결과</span><button type="button" className={bundle.decision === 'approved' ? 'active approve' : ''} onClick={() => setBundles((current) => current.map((item) => item.id === bundle.id ? { ...item, decision: 'approved', comment: '' } : item))}>✓ 승인</button><button type="button" className={bundle.decision === 'rejected' ? 'active reject' : ''} onClick={() => setBundles((current) => current.map((item) => item.id === bundle.id ? { ...item, decision: 'rejected' } : item))}>↩ 반려</button></div>{bundle.decision === 'rejected' && <label>보완 요청 코멘트 <span>*</span><textarea value={bundle.comment} maxLength={documentLimits.comment} onChange={(event) => setBundles((current) => current.map((item) => item.id === bundle.id ? { ...item, comment: event.target.value } : item))} placeholder="이 담당업무 단위에서 보완해야 할 내용을 구체적으로 적어주세요." rows={3} /></label>}</div>}
          {role === 'manager' && status === 'pending' && fixedApprovedBundleIds.has(bundle.id) && <div className="ho-manager-fixed"><span>✓</span><p><b>이전 검토에서 승인됨</b>승인 결과가 유지되어 다시 검토하지 않습니다.</p></div>}
          {role === 'author' && status === 'rejected' && bundle.decision === 'approved' && <div className="ho-manager-fixed"><span>✓</span><p><b>승인 상태로 고정됨</b>이 단위와 그 안의 항목은 수정할 수 없고, 다시 제출해도 재검토되지 않습니다.</p></div>}
          {role === 'author' && bundle.decision === 'rejected' && bundle.comment && <div className="ho-manager-comment"><span>파트장 코멘트</span><p>{bundle.comment}</p></div>}
        </article>)}</div>
        <aside className="ho-review-side"><span>제출한 문서</span><h3>제출 정보</h3><dl><div><dt>작성자</dt><dd>{ownerName || '—'}</dd></div><div><dt>소속</dt><dd>국제처</dd></div><div><dt>담당업무 단위</dt><dd>{bundles.length}개</dd></div><div><dt>전체 항목</dt><dd>{entries.length}개</dd></div><div><dt>제출일</dt><dd>{submittedAt ? onDate(submittedAt) : '제출 전'}</dd></div><div><dt>검토 결과</dt><dd>{status === 'pending' ? '검토 대기' : status === 'approved' ? '승인 완료' : status === 'rejected' ? '반려' : '제출 전'}</dd></div>{reviewedAt && <div><dt>검토일</dt><dd>{onDate(reviewedAt)}</dd></div>}{reviewedBy && <div><dt>검토자</dt><dd>{reviewedBy}</dd></div>}</dl>{role === 'manager' && status === 'pending' && <div className="ho-review-guide"><b>검토 안내</b><p>이전에 승인한 단위는 고정됩니다. 다시 제출된 단위만 승인 또는 반려해 주세요.</p></div>}</aside></div>
        {role === 'manager' && status === 'pending' && <div className="ho-review-submit"><div><b>{bundles.filter((bundle) => bundle.decision).length} / {bundles.length}</b><span>업무 단위 검토 완료</span></div><button type="button" onClick={completeReview} disabled={!reviewReady || busy}>{busy ? '전송 중…' : '검토 완료 및 결과 전송'} <span>→</span></button></div>}
        {role === 'author' && status === 'approved' && <div className="ho-resubmit approved"><div><span>✓</span><p><b>승인 완료 · 이 문서는 더 이상 수정할 수 없습니다.</b><small>{reviewedBy ? `${reviewedBy} 파트장이 ` : '파트장이 '}{bundles.length}개 담당업무 단위를 모두 승인했습니다. 다음 학년도 인수인계는 연간 업데이트에서 시작할 수 있습니다.</small></p></div><button type="button" onClick={() => { setRole('author'); setTab('write'); setAnnualOpen(true); }}>연간 업데이트 시작 <span>→</span></button></div>}
        {role === 'author' && status === 'rejected' && <div className="ho-resubmit"><div><span>↻</span><p><b>반려된 업무 단위만 다시 작성할 수 있습니다.</b><small>승인된 단위와 항목은 그대로 고정되며 재검토 대상에서도 제외됩니다.</small></p></div><button type="button" onClick={reopenDraft}>반려 항목 수정하기 <span>→</span></button></div>}
      </>}
    </section>}
    {draftOpen && <DraftModal onAdopt={adoptProposal} onClose={() => setDraftOpen(false)} />}
    {importOpen && <ImportModal onAdopt={(item) => adoptProposal(item, '분류된 항목을 추가했습니다.')} onClose={() => setImportOpen(false)} />}
    {annualOpen && <AnnualModal entries={status === 'rejected' ? entries.filter((entry) => !approvedEntryIds.has(entry.id)) : entries} startsNewCycle={status === 'approved'} onApply={applyAnnual} onClose={() => setAnnualOpen(false)} />}
    {editor && <EntryEditor category={categories.find((category) => category.id === editor.category)!} entry={editor.entry} onSave={saveEntry} onClose={() => setEditor(null)} />}
    {detailBundle && detailEntry && <EntryDetailModal entry={detailEntry} bundle={detailBundle} entries={entries} onSelect={(entryId) => setDetailView({ bundleId: detailBundle.id, entryId })} onClose={() => setDetailView(null)} />}
  </main>;
}
