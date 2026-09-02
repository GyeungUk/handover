'use client';

import { useEffect, type CSSProperties } from 'react';
import type { HandoverEntry, WorkBundle } from '../../handover-schema';
import { AttachmentAction, CategoryIcon } from '../atoms';
import { categories, fontStack } from '../categories';
import { fileKind, formatBytes } from '../format';
import { Button, Modal } from '../../ui';

export default function EntryDetailModal({ entry, bundle, entries, onSelect, onClose }: { entry: HandoverEntry; bundle: WorkBundle; entries: HandoverEntry[]; onSelect: (entryId: string) => void; onClose: () => void }) {
  const category = categories.find((item) => item.id === entry.category)!;
  const ordered = categories.flatMap((meta) => entries.filter((item) => item.category === meta.id && bundle.entryIds.includes(item.id)));
  const index = ordered.findIndex((item) => item.id === entry.id);
  const filled = category.propertyFields.filter((field) => entry.properties[field.key]);

  /* Escape is `Modal`'s job now. What is left is this dialog's own: stepping
     through the unit's entries without reaching for the buttons.

     The dependency array is the fix that came with the move — there was none
     before, so the listener was torn down and re-registered on every render. */
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && index > 0) onSelect(ordered[index - 1].id);
      if (event.key === 'ArrowRight' && index >= 0 && index < ordered.length - 1) onSelect(ordered[index + 1].id);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, onSelect, ordered]);

  return <Modal
    onClose={onClose}
    width="lg"
    className="ho-detail-modal"
    head={<header className="ui-modal-head ho-detail-head">
      <div className="ho-modal-icon"><CategoryIcon category={category.id} /></div>
      <div>
        <span className="ho-step">{bundle.title} · {category.step}번 섹션</span>
        <h2 className="ui-h2" id="ho-detail-title">{entry.title}</h2>
        <p className="ui-text sm muted">{category.label}</p>
      </div>
      <button className="ui-modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
    </header>}
    labelledBy="ho-detail-title"
    footer={<>
      <Button size="sm" onClick={() => onSelect(ordered[index - 1].id)} disabled={index <= 0} leading={<span aria-hidden="true">←</span>}>이전 항목</Button>
      <em className="ho-detail-count">{index + 1} / {ordered.length}</em>
      <Button size="sm" onClick={() => onSelect(ordered[index + 1].id)} disabled={index < 0 || index >= ordered.length - 1} glyph="→">다음 항목</Button>
      <span className="spacer" />
      <Button variant="primary" size="sm" onClick={onClose}>닫기</Button>
    </>}
  >
    <div style={{ '--category': category.accent, '--category-soft': category.soft } as CSSProperties}>
      <div className="ho-detail-body">
        {filled.length > 0 && <dl className="ho-detail-properties">{filled.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{entry.properties[field.key]}</dd></div>)}</dl>}
        <div className="ho-detail-content" style={{ fontFamily: fontStack(entry.formatting.fontFamily), fontSize: `${entry.formatting.fontSize}px` }} dangerouslySetInnerHTML={{ __html: entry.detail }} />
        <div className="ho-detail-files">
          <span>첨부파일 <b>{entry.attachments.length}개</b></span>
          {entry.attachments.length > 0
            ? <ul>{entry.attachments.map((file) => <li key={file.id}><span className="ho-file-kind">{fileKind(file.name)}</span><span className="ho-file-meta"><b>{file.name}</b><small>{formatBytes(file.size)}</small></span><AttachmentAction file={file} label="내려받기" /></li>)}</ul>
            : <p>이 항목에 첨부된 파일이 없습니다.</p>}
        </div>
      </div>
    </div>
  </Modal>;
}
