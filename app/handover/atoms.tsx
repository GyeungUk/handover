'use client';

import type { EntryAttachment, WorkflowStatus } from '../handover-schema';
import type { HandoverCategory } from '../handover-schema';

/** Where the document stands against the server. `saved` covers "nothing to send" as well. */
export type SaveState = 'saved' | 'saving' | 'error';

export function CategoryIcon({ category }: { category: HandoverCategory }) {
  if (category === 'responsibility') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5.8C8 4.8 8.8 4 9.8 4h4.4c1 0 1.8.8 1.8 1.8V7M4 10.5h16M9 10.5v1.2h6v-1.2M5 7h14c.6 0 1 .4 1 1v10c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1V8c0-.6.4-1 1-1Z" /></svg>;
  if (category === 'plan') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v3M17 4v3M4 9h16M6 6h12c1.1 0 2 .9 2 2v11H4V8c0-1.1.9-2 2-2Zm2 7h3v3H8v-3Z" /></svg>;
  if (category === 'issue') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 16H3L12 4Zm0 5v5m0 3v.2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6V4Zm8 0v4h4M9 12h6M9 16h4" /></svg>;
}

export function StatusBadge({ status }: { status: WorkflowStatus }) {
  const labels: Record<WorkflowStatus, string> = { draft: '작성 중', pending: '검토 대기', rejected: '반려', approved: '승인 완료' };
  return <span className={`ho-status ${status}`}><i />{labels[status]}</span>;
}

/**
 * The open/download control for one attachment.
 *
 * Only the object URL of a file picked in this tab can be opened. A document loaded back from the
 * database carries the file's name and size but no URL, so it says so rather than offering a link
 * that would go nowhere.
 */
export function AttachmentAction({ file, label }: { file: EntryAttachment; label: string }) {
  if (!file.url) return <em className="ho-file-missing">다시 첨부 필요</em>;
  return <a href={file.url} download={file.name} target="_blank" rel="noreferrer">{label}</a>;
}

export function SaveIndicator({ state, savedAt, message }: { state: SaveState; savedAt: string | null; message: string }) {
  if (state === 'saving') return <span className="ho-save-state saving"><i />저장 중…</span>;
  if (state === 'error') return <span className="ho-save-state error" role="alert"><i />{message || '저장 실패'}</span>;
  return <span className="ho-save-state saved"><i />{savedAt ? `${new Date(savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장됨` : '저장 전'}</span>;
}
