'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  handoverCategoryLabels,
  type HandoverArchiveListResponse,
  type HandoverArchiveResponse,
  type HandoverArchiveSummary,
  type HandoverDocument,
} from '../../handover-schema';
import { Button, Modal } from '../../ui';
import { categories } from '../categories';
import { sanitizeRichHtml } from '../format';
import { printHandoverDocument } from '../print';

/**
 * The years already on file.
 *
 * The workspace only ever holds the year being written. Every year before it was approved and then
 * frozen, and this is the only way back into one: pick a year — and, for a part leader, an author —
 * and read the document exactly as it was approved, or print it.
 */
export default function ArchiveModal({ viewerRole, currentEmail, onClose }: {
  viewerRole: 'admin' | 'member';
  currentEmail: string;
  onClose: () => void;
}) {
  const [archives, setArchives] = useState<HandoverArchiveSummary[]>([]);
  const [listing, setListing] = useState(true);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState<HandoverArchiveResponse | null>(null);
  const [openingKey, setOpeningKey] = useState('');
  /* A part leader browses the office by year first; an author has only their own rows. */
  const [year, setYear] = useState<number | null>(null);

  const keyOf = (archive: Pick<HandoverArchiveSummary, 'ownerEmail' | 'academicYear'>) =>
    `${archive.ownerEmail}:${archive.academicYear}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/handover/archives');
        const data = await response.json() as HandoverArchiveListResponse & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? '보관된 인수인계서를 불러오지 못했습니다.');
          return;
        }
        setArchives(data.archives ?? []);
        setYear(data.archives?.[0]?.academicYear ?? null);
      } catch {
        if (!cancelled) setError('네트워크 오류로 보관 기록을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setListing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const years = useMemo(
    () => [...new Set(archives.map((archive) => archive.academicYear))].sort((a, b) => b - a),
    [archives],
  );
  const shown = useMemo(
    () => archives.filter((archive) => year === null || archive.academicYear === year),
    [archives, year],
  );

  const open = useCallback(async (archive: HandoverArchiveSummary) => {
    setOpeningKey(keyOf(archive));
    setError('');
    try {
      const query = archive.ownerEmail === currentEmail ? '' : `?owner=${encodeURIComponent(archive.ownerEmail)}`;
      const response = await fetch(`/api/handover/archives/${archive.academicYear}${query}`);
      const data = await response.json() as HandoverArchiveResponse & { error?: string };
      if (!response.ok || !data.document) {
        setError(data.error ?? '보관된 인수인계서를 열지 못했습니다.');
        return;
      }
      /* Stored HTML from a year the current editor never touched: sanitise it before it renders. */
      setOpened({
        archive: data.archive,
        document: {
          ...data.document,
          entries: data.document.entries.map((entry) => ({ ...entry, detail: sanitizeRichHtml(entry.detail) })),
        },
      });
    } catch {
      setError('네트워크 오류로 보관된 인수인계서를 열지 못했습니다.');
    } finally {
      setOpeningKey('');
    }
  }, [currentEmail]);

  const print = (archive: HandoverArchiveSummary, document: HandoverDocument) =>
    printHandoverDocument(document, { academicYearLabel: archive.academicYearLabel, archived: true });

  const onDate = (value: string | null) => value
    ? new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '—';

  return <Modal
    onClose={onClose}
    width="xl"
    className="ho-archive-modal"
    initialFocus="dialog"
    title="연도별 인수인계 기록"
    description={viewerRole === 'admin'
      ? '승인된 인수인계서는 학년도별로 보관됩니다. 파트원 전체의 지난 학년도 문서를 열람하고 PDF로 저장할 수 있습니다.'
      : '승인된 내 인수인계서는 학년도별로 보관됩니다. 지난 학년도 문서를 열람하고 PDF로 저장할 수 있습니다.'}
    footer={<>
      <p className="ho-modal-note"><span aria-hidden="true">ⓘ</span> 보관된 문서는 승인 당시 내용 그대로이며 수정할 수 없습니다.</p>
      <span className="spacer" />
      {opened && <Button onClick={() => setOpened(null)}>목록으로</Button>}
      {opened && <Button variant="primary" onClick={() => print(opened.archive, opened.document)}>PDF로 저장 · 인쇄</Button>}
      {!opened && <Button onClick={onClose}>닫기</Button>}
    </>}
  >
    {error && <p className="ho-draft-error" role="alert">{error}</p>}
    {listing && <div className="ho-draft-loading"><i /><i /><i /><p>보관된 학년도를 불러오고 있습니다.</p></div>}

    {!listing && !archives.length && !error && <p className="ho-annual-empty">
      아직 보관된 학년도가 없습니다. 파트장이 인수인계서를 승인하면 그 학년도의 기록으로 남습니다.
    </p>}

    {!listing && archives.length > 0 && !opened && <>
      {years.length > 1 && <div className="ho-archive-years" role="tablist">
        {years.map((option) => <button
          type="button"
          role="tab"
          key={option}
          aria-selected={year === option}
          className={year === option ? 'active' : ''}
          onClick={() => setYear(option)}
        >{option}학년도<b>{archives.filter((archive) => archive.academicYear === option).length}</b></button>)}
      </div>}
      <ul className="ho-archive-list">{shown.map((archive) => <li key={keyOf(archive)}>
        <button type="button" onClick={() => void open(archive)} disabled={Boolean(openingKey)}>
          <span className="ho-archive-year">{archive.academicYearLabel}</span>
          <span className="ho-archive-who">
            <b>{archive.ownerName || archive.ownerEmail}</b>
            {archive.ownerEmail !== currentEmail && <small>{archive.ownerEmail}</small>}
          </span>
          <span className="ho-archive-counts">담당업무 단위 {archive.bundleCount}개 · 항목 {archive.entryCount}개</span>
          <span className="ho-archive-when">승인 {onDate(archive.reviewedAt)}{archive.reviewedBy ? ` · ${archive.reviewedBy}` : ''}</span>
          <span className="ho-archive-open" aria-hidden="true">{openingKey === keyOf(archive) ? '…' : '→'}</span>
        </button>
      </li>)}</ul>
    </>}

    {opened && <div className="ho-archive-reader">
      <div className="ho-archive-reader-head">
        <div>
          <span>{opened.archive.academicYearLabel}</span>
          <h3>{opened.document.ownerName || opened.archive.ownerEmail}님의 인수인계서</h3>
          <p>제출 {onDate(opened.document.submittedAt)} · 승인 {onDate(opened.document.reviewedAt)}{opened.document.reviewedBy ? ` · ${opened.document.reviewedBy}` : ''}</p>
        </div>
        <b className="ho-archive-frozen">승인 당시 원본</b>
      </div>
      {opened.document.bundles.map((bundle, index) => {
        const bundleEntries = bundle.entryIds
          .map((entryId) => opened.document.entries.find((entry) => entry.id === entryId))
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        return <section className="ho-archive-unit" key={bundle.id}>
          <div className="ho-archive-unit-head">
            <span>A-{String(index + 1).padStart(2, '0')}</span>
            <h4>{bundle.title || '이름 없는 담당업무 단위'}</h4>
          </div>
          {bundleEntries.map((entry) => {
            const meta = categories.find((category) => category.id === entry.category);
            return <article className="ho-archive-entry" key={entry.id} style={meta ? { borderLeftColor: meta.accent } : undefined}>
              <span className="ho-archive-section">{handoverCategoryLabels[entry.category]}</span>
              <h5>{entry.title}</h5>
              <div className="ho-draft-body" dangerouslySetInnerHTML={{ __html: entry.detail }} />
            </article>;
          })}
        </section>;
      })}
    </div>}
  </Modal>;
}
