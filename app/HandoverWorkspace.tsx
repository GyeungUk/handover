'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';

import { annualActionLabels, propertyFieldsByCategory, type AnnualAction, type AnnualItem, type AnnualResponse, type DraftItem, type DraftResponse, type HandoverCategory, type ImportItem, type ImportResponse, type PropertyField, type QualityResponse } from './handover-schema';
import { extractText, supportedNote } from './file-text';
import { seedTeams } from './org-data';

export type { HandoverCategory };
type WorkspaceTab = 'write' | 'compose' | 'review';
type WorkflowStatus = 'draft' | 'pending' | 'rejected' | 'approved';
type ReviewDecision = 'approved' | 'rejected' | null;

type HandoverEntry = {
  id: string;
  category: HandoverCategory;
  title: string;
  detail: string;
  properties: Record<string, string>;
  attachments: EntryAttachment[];
  formatting: EntryFormatting;
};

/** The shape every AI proposal boils down to before it becomes a real entry. */
type AdoptableItem = { category: HandoverCategory; title: string; detail: string; properties: Record<string, string> };

type EntryAttachment = { id: string; name: string; size: number; type: string; url: string };
type EntryFormatting = { fontFamily: string; fontSize: string };

type WorkBundle = {
  id: string;
  title: string;
  entryIds: string[];
  decision: ReviewDecision;
  comment: string;
};

type CategoryMeta = {
  id: HandoverCategory;
  step: string;
  label: string;
  short: string;
  description: string;
  accent: string;
  soft: string;
  placeholder: string;
  propertyFields: PropertyField[];
};

const categories: CategoryMeta[] = [
  { id: 'responsibility', step: '01', label: '담당업무', short: '담당업무', description: '현재 맡고 있는 역할과 책임 범위를 기록합니다.', accent: '#315a83', soft: '#edf3f8', placeholder: '예: 외국인 유학생 체류·비자 관리', propertyFields: propertyFieldsByCategory.responsibility },
  { id: 'plan', step: '02', label: '주요업무계획 및 진행사항', short: '계획 및 진행', description: '예정된 일정과 현재까지의 진행 상황을 남깁니다.', accent: '#3f7768', soft: '#edf5f2', placeholder: '예: 2학기 체류기간 연장 단체접수', propertyFields: propertyFieldsByCategory.plan },
  { id: 'issue', step: '03', label: '현안사항 및 문제점', short: '현안 및 문제', description: '주의가 필요한 이슈와 대응 상황을 정리합니다.', accent: '#b56c3d', soft: '#fbf2eb', placeholder: '예: 보완서류 제출 지연 학생 발생', propertyFields: propertyFieldsByCategory.issue },
  { id: 'pending', step: '04', label: '주요미결사항', short: '미결사항', description: '아직 완료되지 않아 후속 조치가 필요한 일을 적습니다.', accent: '#9b4d58', soft: '#faeef0', placeholder: '예: 출입국 방문 일정 최종 확정 대기', propertyFields: propertyFieldsByCategory.pending },
];

const defaultFormatting: EntryFormatting = { fontFamily: 'Pretendard', fontSize: '16' };

const initialEntries: HandoverEntry[] = [
  { id: 'r1', category: 'responsibility', title: '유학생 체류·비자 관리', detail: '<p>D-2 체류자격 변경, 기간 연장, 외국인등록 단체접수를 담당합니다.</p><ul><li>대상자 명단 및 체류기간 확인</li><li>제출서류 검토와 보완 안내</li></ul>', properties: { cycle: '수시', department: '학사지원팀', importance: '핵심' }, attachments: [], formatting: defaultFormatting },
  { id: 'r2', category: 'responsibility', title: '유학생 보험 및 생활지원', detail: '<p>보험 가입 현황과 생활 민원을 확인하고 관련 기관과 협의합니다.</p>', properties: { cycle: '매월', department: '학생지원팀', importance: '중요' }, attachments: [], formatting: defaultFormatting },
  { id: 'p1', category: 'plan', title: '2학기 체류기간 연장 단체접수', detail: '<p><strong>대상자 84명 중 71명</strong>의 서류 검토를 완료했습니다.</p><table><thead><tr><th>구분</th><th>진행 현황</th><th>비고</th></tr></thead><tbody><tr><td>서류 접수</td><td>71 / 84명</td><td>13명 보완 중</td></tr><tr><td>출입국 제출</td><td>9월 6일 예정</td><td>방문 예약 완료</td></tr></tbody></table>', properties: { due: '2026. 09. 06', progress: '75%', next: '박민서 주임' }, attachments: [], formatting: defaultFormatting },
  { id: 'p2', category: 'plan', title: '외국인등록증 신규 발급', detail: '<p>신입생 안내를 완료했고 학과별 서류를 취합하고 있습니다.</p>', properties: { due: '2026. 09. 12', progress: '50%', next: '최지우 주임' }, attachments: [], formatting: defaultFormatting },
  { id: 'i1', category: 'issue', title: '보완서류 제출 지연', detail: '<p>재정증명 보완 대상 6명 중 2명의 회신이 지연되고 있습니다.</p><p><strong>9월 1일까지 미회신 시 학과에 협조 요청</strong>이 필요합니다.</p>', properties: { impact: '높음', response: '대응 중', department: '출입국관리사무소' }, attachments: [], formatting: defaultFormatting },
  { id: 'i2', category: 'issue', title: '보험사 시스템 변경', detail: '<p>신규 관리자 페이지 전환으로 단체 가입 명단 형식 확인이 필요합니다.</p>', properties: { impact: '보통', response: '협의 중', department: '보험사 담당센터' }, attachments: [], formatting: defaultFormatting },
  { id: 'm1', category: 'pending', title: '출입국 방문 일정 확정', detail: '<p>담당 주무관 회신 대기 중이며 확정 후 학생 공지가 필요합니다.</p>', properties: { due: '2026. 09. 02', priority: '높음', owner: '김지현' }, attachments: [], formatting: defaultFormatting },
  { id: 'm2', category: 'pending', title: '보험 미가입자 3명 후속 확인', detail: '<p>개별 가입 증빙을 받지 못한 학생에게 2차 안내가 필요합니다.</p>', properties: { due: '2026. 09. 05', priority: '보통', owner: '최지우' }, attachments: [], formatting: defaultFormatting },
];

const initialBundles: WorkBundle[] = [
  { id: 'b1', title: '체류·비자 관리', entryIds: ['r1', 'p1', 'p2', 'i1', 'm1'], decision: null, comment: '' },
  { id: 'b2', title: '보험 및 생활지원', entryIds: ['r2', 'i2', 'm2'], decision: null, comment: '' },
];

function CategoryIcon({ category }: { category: HandoverCategory }) {
  if (category === 'responsibility') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5.8C8 4.8 8.8 4 9.8 4h4.4c1 0 1.8.8 1.8 1.8V7M4 10.5h16M9 10.5v1.2h6v-1.2M5 7h14c.6 0 1 .4 1 1v10c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1V8c0-.6.4-1 1-1Z" /></svg>;
  if (category === 'plan') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v3M17 4v3M4 9h16M6 6h12c1.1 0 2 .9 2 2v11H4V8c0-1.1.9-2 2-2Zm2 7h3v3H8v-3Z" /></svg>;
  if (category === 'issue') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 16H3L12 4Zm0 5v5m0 3v.2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6V4Zm8 0v4h4M9 12h6M9 16h4" /></svg>;
}

function StatusBadge({ status }: { status: WorkflowStatus }) {
  const labels: Record<WorkflowStatus, string> = { draft: '작성 중', pending: '검토 대기', rejected: '반려', approved: '승인 완료' };
  return <span className={`ho-status ${status}`}><i />{labels[status]}</span>;
}

const maxAttachments = 10;
const maxAttachmentBytes = 20 * 1024 * 1024;

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(name: string) {
  const extension = name.includes('.') ? name.split('.').pop() ?? '' : '';
  return extension ? extension.slice(0, 4).toUpperCase() : 'FILE';
}

function plainText(html: string) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function EntryEditor({ category, entry, onSave, onClose }: { category: CategoryMeta; entry?: HandoverEntry; onSave: (title: string, detail: string, properties: Record<string, string>, formatting: EntryFormatting, attachments: EntryAttachment[]) => void; onClose: () => void }) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [properties, setProperties] = useState<Record<string, string>>(entry?.properties ?? {});
  const [formatting, setFormatting] = useState<EntryFormatting>(entry?.formatting ?? defaultFormatting);
  const [attachments, setAttachments] = useState<EntryAttachment[]>(entry?.attachments ?? []);
  const [attachmentError, setAttachmentError] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createdUrls = useRef(new Set<string>());
  const editorRef = useRef<HTMLDivElement>(null);
  const initialDetail = entry?.detail ?? '';
  const detailRef = useRef(initialDetail);
  const [contentLength, setContentLength] = useState(() => plainText(initialDetail).length);
  const hasContent = contentLength > 0;

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = detailRef.current;
  }, []);

  const syncEditorValue = () => {
    if (!editorRef.current) return;
    detailRef.current = editorRef.current.innerHTML;
    setContentLength(plainText(detailRef.current).length);
  };

  const placeCaretAtEnd = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (selection?.anchorNode && editor.contains(selection.anchorNode)) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const runCommand = (event: ReactMouseEvent<HTMLButtonElement>, command: string, value?: string) => {
    event.preventDefault();
    editorRef.current?.focus();
    placeCaretAtEnd();
    document.execCommand(command, false, value);
    syncEditorValue();
  };

  const insertStatusTable = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const table = '<table><thead><tr><th>구분</th><th>진행 현황</th><th>비고</th></tr></thead><tbody><tr><td>항목 1</td><td>내용 입력</td><td>-</td></tr><tr><td>항목 2</td><td>내용 입력</td><td>-</td></tr></tbody></table><p><br></p>';
    editorRef.current?.focus();
    placeCaretAtEnd();
    document.execCommand('insertHTML', false, table);
    syncEditorValue();
  };

  const addFiles = (fileList: FileList | null) => {
    const incoming = Array.from(fileList ?? []);
    if (!incoming.length) return;
    const room = maxAttachments - attachments.length;
    if (room <= 0) {
      setAttachmentError(`첨부파일은 항목당 최대 ${maxAttachments}개까지 올릴 수 있습니다.`);
      return;
    }
    const oversized = incoming.filter((file) => file.size > maxAttachmentBytes);
    const accepted = incoming.filter((file) => file.size <= maxAttachmentBytes).slice(0, room);
    setAttachments((current) => [...current, ...accepted.map((file) => {
      const url = URL.createObjectURL(file);
      createdUrls.current.add(url);
      return { id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, size: file.size, type: file.type, url };
    })]);
    setAttachmentError(oversized.length
      ? `${oversized[0].name} 등 ${oversized.length}개 파일이 20MB를 넘어 제외되었습니다.`
      : incoming.length > accepted.length ? `최대 ${maxAttachments}개까지만 추가했습니다.` : '');
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((file) => {
      if (file.id !== id) return true;
      if (createdUrls.current.delete(file.url)) URL.revokeObjectURL(file.url);
      return false;
    }));
    setAttachmentError('');
  };

  const discardAndClose = () => {
    createdUrls.current.forEach((url) => URL.revokeObjectURL(url));
    createdUrls.current.clear();
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !hasContent) return;
    createdUrls.current.clear();
    onSave(title.trim(), detailRef.current.trim(), properties, formatting, attachments);
  };
  return <div className="modal-backdrop ho-modal-backdrop" role="presentation" onMouseDown={discardAndClose}>
    <form className="ho-entry-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} style={{ '--category': category.accent, '--category-soft': category.soft } as React.CSSProperties}>
      <button className="modal-close" type="button" onClick={discardAndClose} aria-label="닫기">×</button>
      <div className="ho-editor-heading"><div className="ho-modal-icon"><CategoryIcon category={category.id} /></div><div><span className="modal-label">{entry ? 'EDIT DOCUMENT' : 'NEW DOCUMENT'} · SECTION {category.step}</span><h2>{category.label}</h2><p>{category.description}</p></div><span className="ho-autosave"><i /> 임시 저장됨</span></div>
      <label className="ho-title-field">문서 제목<span>*</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={category.placeholder} maxLength={80} /></label>
      <fieldset className="ho-property-fields"><legend>문서 속성</legend>{category.propertyFields.map((field) => <label key={field.key}><span>{field.label}</span>{field.options ? <select value={properties[field.key] ?? ''} onChange={(event) => setProperties((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">{field.placeholder}</option>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input value={properties[field.key] ?? ''} onChange={(event) => setProperties((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} />}</label>)}</fieldset>
      <div className="ho-document-label"><span>본문 작성 <b>*</b></span><small>텍스트를 선택한 뒤 서식을 적용할 수 있습니다.</small></div>
      <div className="ho-office-editor">
        <div className="ho-editor-toolbar" role="toolbar" aria-label="문서 서식">
          <select aria-label="글꼴" value={formatting.fontFamily} onChange={(event) => setFormatting((current) => ({ ...current, fontFamily: event.target.value }))}><option value="Pretendard">프리텐다드</option><option value="Malgun Gothic">맑은 고딕</option><option value="Batang">바탕</option><option value="Gulim">굴림</option></select>
          <select aria-label="글자 크기" value={formatting.fontSize} onChange={(event) => setFormatting((current) => ({ ...current, fontSize: event.target.value }))}><option value="14">14</option><option value="16">16</option><option value="18">18</option><option value="20">20</option></select>
          <i />
          <button type="button" className="bold" title="굵게" aria-label="굵게" onMouseDown={(event) => runCommand(event, 'bold')}>B</button>
          <button type="button" className="underline" title="밑줄" aria-label="밑줄" onMouseDown={(event) => runCommand(event, 'underline')}>U</button>
          <button type="button" className="highlight" title="형광펜" aria-label="형광펜" onMouseDown={(event) => runCommand(event, 'backColor', '#fff0a8')}>A</button>
          <i />
          <button type="button" title="왼쪽 정렬" aria-label="왼쪽 정렬" onMouseDown={(event) => runCommand(event, 'justifyLeft')}>≡</button>
          <button type="button" title="가운데 정렬" aria-label="가운데 정렬" onMouseDown={(event) => runCommand(event, 'justifyCenter')}>≣</button>
          <button type="button" title="글머리 기호" aria-label="글머리 기호" onMouseDown={(event) => runCommand(event, 'insertUnorderedList')}>•≡</button>
          <button type="button" title="번호 목록" aria-label="번호 목록" onMouseDown={(event) => runCommand(event, 'insertOrderedList')}>1≡</button>
          <i />
          <button type="button" className="table-button" title="진행 현황 표 삽입" onMouseDown={insertStatusTable}><span>▦</span> 표 삽입</button>
          <button type="button" title="실행 취소" aria-label="실행 취소" onMouseDown={(event) => runCommand(event, 'undo')}>↶</button>
          <button type="button" title="다시 실행" aria-label="다시 실행" onMouseDown={(event) => runCommand(event, 'redo')}>↷</button>
        </div>
        <div ref={editorRef} className="ho-rich-editor" contentEditable suppressContentEditableWarning data-placeholder="다음 담당자가 바로 업무를 이어갈 수 있도록 내용을 작성하세요. 표, 목록, 강조 서식을 함께 사용할 수 있습니다." style={{ fontFamily: formatting.fontFamily, fontSize: `${formatting.fontSize}px` }} onInput={syncEditorValue} />
        <div className="ho-editor-status"><span>▦ 표 삽입 가능</span><span>{contentLength}자</span></div>
      </div>
      <div className="ho-attach-block">
        <div className="ho-document-label"><span>첨부파일</span><small>최대 {maxAttachments}개 · 파일당 20MB까지</small></div>
        <div
          className={`ho-dropzone ${dropActive ? 'active' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDropActive(true); }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(event) => { event.preventDefault(); setDropActive(false); addFiles(event.dataTransfer.files); }}
        >
          <span className="ho-dropzone-icon" aria-hidden="true">⇪</span>
          <p><b>파일을 끌어다 놓으세요</b><small>공문, 서식, 명단, 화면 캡처 등 이 항목과 관련된 자료를 함께 남길 수 있습니다.</small></p>
          <button type="button" onClick={() => fileInputRef.current?.click()}>파일 선택</button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
        </div>
        {attachmentError && <p className="ho-attach-error" role="alert">{attachmentError}</p>}
        {attachments.length > 0 && <ul className="ho-attach-list">{attachments.map((file) => <li key={file.id}>
          <span className="ho-file-kind">{fileKind(file.name)}</span>
          <span className="ho-file-meta"><b>{file.name}</b><small>{formatBytes(file.size)}</small></span>
          <a href={file.url} download={file.name} target="_blank" rel="noreferrer">열기</a>
          <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`${file.name} 첨부 삭제`}>삭제</button>
        </li>)}</ul>}
      </div>
      <div className="ho-modal-actions"><p><span>ⓘ</span> 작성한 서식과 표, 첨부파일은 제출 문서에도 그대로 표시됩니다.</p><button type="button" onClick={discardAndClose}>취소</button><button type="submit" disabled={!title.trim() || !hasContent}>{entry ? '문서 저장' : '항목 추가'}</button></div>
    </form>
  </div>;
}

function BundleReadOnly({ bundle, entries, onOpenEntry }: { bundle: WorkBundle; entries: HandoverEntry[]; onOpenEntry: (entryId: string) => void }) {
  return <div className="ho-read-bundle">
    <div className="ho-read-bundle-head"><span>{String(bundle.title).slice(0, 1)}</span><div><small>HANDOVER UNIT</small><h3>{bundle.title}</h3></div><b>{bundle.entryIds.length}개 항목</b></div>
    <div className="ho-read-columns">{categories.map((category) => {
      const items = entries.filter((entry) => entry.category === category.id && bundle.entryIds.includes(entry.id));
      return <div key={category.id} style={{ '--category': category.accent } as React.CSSProperties}><span><i />{category.short}<em>{items.length}</em></span>{items.length ? items.map((item) => <article key={item.id}><b>{item.title}</b><div className="ho-read-properties">{category.propertyFields.map((field) => item.properties[field.key] && <span key={field.key}>{field.label} · {item.properties[field.key]}</span>)}</div><div className="ho-rich-read" style={{ fontFamily: item.formatting.fontFamily, fontSize: `${item.formatting.fontSize}px` }} dangerouslySetInnerHTML={{ __html: item.detail }} />{item.attachments.length > 0 && <div className="ho-read-files">{item.attachments.map((file) => <a key={file.id} href={file.url} download={file.name} target="_blank" rel="noreferrer"><i>{fileKind(file.name)}</i><b>{file.name}</b><em>{formatBytes(file.size)}</em></a>)}</div>}<button type="button" className="ho-read-open" onClick={() => onOpenEntry(item.id)}>자세히 보기 <span aria-hidden="true">→</span></button></article>) : <p className="ho-no-item">연결된 항목 없음</p>}</div>;
    })}</div>
  </div>;
}

function EntryDetailModal({ entry, bundle, entries, onSelect, onClose }: { entry: HandoverEntry; bundle: WorkBundle; entries: HandoverEntry[]; onSelect: (entryId: string) => void; onClose: () => void }) {
  const category = categories.find((item) => item.id === entry.category)!;
  const ordered = categories.flatMap((meta) => entries.filter((item) => item.category === meta.id && bundle.entryIds.includes(item.id)));
  const index = ordered.findIndex((item) => item.id === entry.id);
  const filled = category.propertyFields.filter((field) => entry.properties[field.key]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && index > 0) onSelect(ordered[index - 1].id);
      if (event.key === 'ArrowRight' && index >= 0 && index < ordered.length - 1) onSelect(ordered[index + 1].id);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  return <div className="modal-backdrop ho-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="ho-detail-modal" role="dialog" aria-modal="true" aria-labelledby="ho-detail-title" onMouseDown={(event) => event.stopPropagation()} style={{ '--category': category.accent, '--category-soft': category.soft } as React.CSSProperties}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
      <div className="ho-detail-head">
        <div className="ho-modal-icon"><CategoryIcon category={category.id} /></div>
        <div><span className="modal-label">{bundle.title} · SECTION {category.step}</span><h2 id="ho-detail-title">{entry.title}</h2><p>{category.label}</p></div>
      </div>
      <div className="ho-detail-body">
        {filled.length > 0 && <dl className="ho-detail-properties">{filled.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{entry.properties[field.key]}</dd></div>)}</dl>}
        <div className="ho-detail-content" style={{ fontFamily: entry.formatting.fontFamily, fontSize: `${entry.formatting.fontSize}px` }} dangerouslySetInnerHTML={{ __html: entry.detail }} />
        <div className="ho-detail-files">
          <span>첨부파일 <b>{entry.attachments.length}개</b></span>
          {entry.attachments.length > 0
            ? <ul>{entry.attachments.map((file) => <li key={file.id}><span className="ho-file-kind">{fileKind(file.name)}</span><span className="ho-file-meta"><b>{file.name}</b><small>{formatBytes(file.size)}</small></span><a href={file.url} download={file.name} target="_blank" rel="noreferrer">내려받기</a></li>)}</ul>
            : <p>이 항목에 첨부된 파일이 없습니다.</p>}
        </div>
      </div>
      <div className="ho-detail-actions">
        <button type="button" disabled={index <= 0} onClick={() => onSelect(ordered[index - 1].id)}><span aria-hidden="true">←</span> 이전 항목</button>
        <em>{index + 1} / {ordered.length}</em>
        <button type="button" disabled={index < 0 || index >= ordered.length - 1} onClick={() => onSelect(ordered[index + 1].id)}>다음 항목 <span aria-hidden="true">→</span></button>
        <button type="button" className="ho-detail-close" onClick={onClose}>닫기</button>
      </div>
    </section>
  </div>;
}

/** Turns a person's calendar into proposed entries. Nothing is saved until the author adopts it. */
function DraftModal({ onAdopt, onClose }: { onAdopt: (item: DraftItem) => void; onClose: () => void }) {
  const [personId, setPersonId] = useState(seedTeams[0].people[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DraftResponse | null>(null);
  const [adopted, setAdopted] = useState<string[]>([]);

  const generate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setAdopted([]);
    try {
      const response = await fetch('/api/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) });
      const data = await response.json() as DraftResponse & { error?: string };
      if (!response.ok) setError(data.error ?? '초안을 만들지 못했습니다.');
      else if (!data.drafts.length) setError('이 담당자의 일정에서는 만들 수 있는 초안이 없습니다.');
      else setResult(data);
    } catch {
      setError('네트워크 오류로 초안을 만들지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const adopt = (item: DraftItem) => {
    onAdopt(item);
    setAdopted((current) => [...current, item.id]);
  };

  const adoptAll = () => {
    if (!result) return;
    result.drafts.filter((item) => !adopted.includes(item.id)).forEach(onAdopt);
    setAdopted(result.drafts.map((item) => item.id));
  };

  const remaining = result ? result.drafts.filter((item) => !adopted.includes(item.id)).length : 0;

  return <div className="modal-backdrop ho-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="ho-draft-modal" role="dialog" aria-modal="true" aria-labelledby="ho-draft-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
      <div className="ho-draft-head">
        <span className="ho-draft-spark" aria-hidden="true">✦</span>
        <div><span className="modal-label">DRAFT FROM CALENDAR</span><h2 id="ho-draft-title">캘린더에서 초안 만들기</h2><p>담당자의 연간 일정과 일정 변경 이력만을 근거로 초안을 제안합니다. 채택하기 전까지 아무것도 저장되지 않습니다.</p></div>
      </div>
      <div className="ho-draft-controls">
        <label><span>담당자</span><select value={personId} onChange={(event) => setPersonId(event.target.value)} disabled={loading}>{seedTeams.map((team) => <optgroup label={team.title} key={team.id}>{team.people.map((person) => <option value={person.id} key={person.id}>{person.name} · {person.role}</option>)}</optgroup>)}</select></label>
        <button type="button" onClick={generate} disabled={loading}>{loading ? '초안 만드는 중…' : result ? '다시 만들기' : '초안 만들기'}</button>
      </div>

      {loading && <div className="ho-draft-loading"><i /><i /><i /><p>연간 일정과 일정 변경 이력을 정리하고 있습니다.</p></div>}
      {error && <p className="ho-draft-error" role="alert">{error}</p>}

      {result && <>
        <div className="ho-draft-summary">
          <p><b>{result.person.name}</b> · {result.person.team} · 오늘 기준 {result.todayLabel}</p>
          <span>{result.drafts.length}건 제안 · {adopted.length}건 채택됨</span>
        </div>
        <div className="ho-draft-list">{result.drafts.map((item) => {
          const meta = categories.find((category) => category.id === item.category)!;
          const isAdopted = adopted.includes(item.id);
          return <article className={`ho-draft-card ${isAdopted ? 'is-adopted' : ''}`} key={item.id} style={{ '--category': meta.accent, '--category-soft': meta.soft } as React.CSSProperties}>
            <div className="ho-draft-card-head">
              <span className="ho-draft-chip"><i />{meta.short}</span>
              <span className={`ho-draft-basis ${item.basis}`}>{item.basis === 'record' ? '기록 기반' : '확인 필요'}</span>
              <small>근거 · {item.sourceTask}</small>
            </div>
            <h4>{item.title}</h4>
            {Object.keys(item.properties).length > 0 && <div className="ho-draft-properties">{meta.propertyFields.map((field) => item.properties[field.key] && <span key={field.key}><b>{field.label}</b>{item.properties[field.key]}</span>)}</div>}
            <div className="ho-draft-body" dangerouslySetInnerHTML={{ __html: item.detail }} />
            <div className="ho-draft-card-actions">
              {isAdopted
                ? <span className="ho-draft-done">✓ 항목으로 추가됨</span>
                : <button type="button" onClick={() => adopt(item)}>이 초안 채택</button>}
            </div>
          </article>;
        })}</div>
      </>}

      <div className="ho-modal-actions">
        <p><span>ⓘ</span> 초안은 일정 기록만을 근거로 합니다. ‘확인이 필요한 내용’의 질문은 작성자가 직접 채워 주세요.</p>
        <button type="button" onClick={onClose}>닫기</button>
        <button type="button" onClick={adoptAll} disabled={!result || remaining === 0}>남은 {remaining}건 모두 채택</button>
      </div>
    </section>
  </div>;
}


/** Reads a handover document the author already has and proposes entries for all four sections. */
function ImportModal({ onAdopt, onClose }: { onAdopt: (item: ImportItem) => void; onClose: () => void }) {
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [adopted, setAdopted] = useState<string[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setResult(null); setAdopted([]); setError(''); };

  const takeFile = async (file: File | null | undefined) => {
    if (!file) return;
    setReading(true);
    reset();
    try {
      const text = await extractText(file);
      if (text.trim().length < 30) throw new Error('파일에서 읽어낸 내용이 너무 짧습니다. 문서 내용을 복사해 아래에 붙여넣어 주세요.');
      setSource(text);
      setFileName(file.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '파일을 읽지 못했습니다.');
    } finally {
      setReading(false);
    }
  };

  const classify = async () => {
    setLoading(true);
    reset();
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, fileName: fileName || '붙여넣은 내용' }),
      });
      const data = await response.json() as ImportResponse & { error?: string };
      if (!response.ok) setError(data.error ?? '자동 분류에 실패했습니다.');
      else if (!data.items.length) setError('네 개 섹션에 넣을 만한 내용을 찾지 못했습니다. 자료를 확인해 주세요.');
      else setResult(data);
    } catch {
      setError('네트워크 오류로 분류하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const adopt = (item: ImportItem) => {
    onAdopt(item);
    setAdopted((current) => [...current, item.id]);
  };

  const adoptAll = () => {
    if (!result) return;
    result.items.filter((item) => !adopted.includes(item.id)).forEach(onAdopt);
    setAdopted(result.items.map((item) => item.id));
  };

  const remaining = result ? result.items.filter((item) => !adopted.includes(item.id)).length : 0;
  const ready = source.trim().length >= 30;

  return <div className="modal-backdrop ho-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="ho-draft-modal" role="dialog" aria-modal="true" aria-labelledby="ho-import-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
      <div className="ho-draft-head">
        <span className="ho-draft-spark" aria-hidden="true">⇪</span>
        <div><span className="modal-label">IMPORT EXISTING DOCUMENT</span><h2 id="ho-import-title">기존 자료 불러오기</h2><p>예전에 쓰던 인수인계 문서를 올리면 담당업무·계획·현안·미결 네 개 섹션으로 나누어 초안을 제안합니다. 채택하기 전까지 아무것도 저장되지 않습니다.</p></div>
      </div>

      <div className="ho-import-input">
        <div
          className={`ho-dropzone ${dropActive ? 'active' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDropActive(true); }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(event) => { event.preventDefault(); setDropActive(false); void takeFile(event.dataTransfer.files?.[0]); }}
        >
          <span className="ho-dropzone-icon" aria-hidden="true">⇪</span>
          <p><b>{reading ? '파일을 읽는 중입니다…' : '기존 인수인계 자료를 끌어다 놓으세요'}</b><small>{supportedNote} 다른 형식은 내용을 복사해 붙여넣어 주세요.</small></p>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={reading || loading}>파일 선택</button>
          <input ref={fileInputRef} type="file" hidden accept=".txt,.md,.csv,.tsv,.json,.html,.docx,text/*" onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
        <label className="ho-import-paste">
          <span>또는 문서 내용을 그대로 붙여넣기</span>
          <textarea value={source} onChange={(event) => { setSource(event.target.value); setFileName(''); reset(); }} rows={5} placeholder={'예)\n담당업무: 외국인 유학생 체류·비자 관리\n2학기 연장 단체접수 진행 중 (84명 중 71명 서류 검토 완료)\n재정증명 보완 대상 2명 회신 지연\n출입국 방문 일정 미확정'} />
        </label>
        <div className="ho-import-actions">
          <small>{fileName ? `${fileName} · ${source.length.toLocaleString()}자 읽음` : source.trim() ? `${source.length.toLocaleString()}자 입력됨` : '아직 읽어들인 내용이 없습니다.'}</small>
          <button type="button" onClick={classify} disabled={!ready || loading || reading}>{loading ? '분류하는 중…' : result ? '다시 분류' : '섹션 자동 분류'}</button>
        </div>
      </div>

      {loading && <div className="ho-draft-loading"><i /><i /><i /><p>자료를 읽고 네 개 섹션으로 나누고 있습니다.</p></div>}
      {error && <p className="ho-draft-error" role="alert">{error}</p>}

      {result && <>
        <div className="ho-import-summary">
          <p><b>{result.fileName}</b> · {result.charCount.toLocaleString()}자에서 {result.items.length}건을 정리했습니다.</p>
          <div className="ho-import-counts">{categories.map((category) => {
            const count = result.items.filter((item) => item.category === category.id).length;
            return <span key={category.id} className={count ? '' : 'empty'} style={{ '--category': category.accent, '--category-soft': category.soft } as React.CSSProperties}><i />{category.short}<b>{count}</b></span>;
          })}</div>
        </div>
        {result.unmapped.length > 0 && <div className="ho-import-unmapped"><b>섹션에 넣지 못한 내용</b><ul>{result.unmapped.map((line) => <li key={line}>{line}</li>)}</ul></div>}
        <div className="ho-draft-list">{result.items.map((item) => {
          const meta = categories.find((category) => category.id === item.category)!;
          const isAdopted = adopted.includes(item.id);
          return <article className={`ho-draft-card ${isAdopted ? 'is-adopted' : ''}`} key={item.id} style={{ '--category': meta.accent, '--category-soft': meta.soft } as React.CSSProperties}>
            <div className="ho-draft-card-head">
              <span className="ho-draft-chip"><i />{meta.short}</span>
              <span className={`ho-draft-basis ${item.confidence === 'high' ? 'record' : 'inferred'}`}>{item.confidence === 'high' ? '섹션 확실' : '섹션 확인 필요'}</span>
              <small>{item.sourceQuote ? '원문 근거 확인됨' : '원문 요약'}</small>
            </div>
            <h4>{item.title}</h4>
            {Object.keys(item.properties).length > 0 && <div className="ho-draft-properties">{meta.propertyFields.map((field) => item.properties[field.key] && <span key={field.key}><b>{field.label}</b>{item.properties[field.key]}</span>)}</div>}
            <div className="ho-draft-body" dangerouslySetInnerHTML={{ __html: item.detail }} />
            {item.sourceQuote && <p className="ho-import-quote"><span>원문</span>“{item.sourceQuote}”</p>}
            <div className="ho-draft-card-actions">
              {isAdopted ? <span className="ho-draft-done">✓ 항목으로 추가됨</span> : <button type="button" onClick={() => adopt(item)}>이 항목 채택</button>}
            </div>
          </article>;
        })}</div>
      </>}

      <div className="ho-modal-actions">
        <p><span>ⓘ</span> 원문에 없는 내용은 만들지 않습니다. 비어 있는 부분은 ‘확인이 필요한 내용’ 질문으로 남습니다.</p>
        <button type="button" onClick={onClose}>닫기</button>
        <button type="button" onClick={adoptAll} disabled={!result || remaining === 0}>남은 {remaining}건 모두 채택</button>
      </div>
    </section>
  </div>;
}

/** Rolls this year's document forward: what repeats, what needs new dates, what should drop out. */
function AnnualModal({ entries, onApply, onClose }: { entries: HandoverEntry[]; onApply: (item: AnnualItem) => void; onClose: () => void }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnnualResponse | null>(null);
  const [applied, setApplied] = useState<string[]>([]);

  const generate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setApplied([]);
    try {
      const response = await fetch('/api/annual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          entries: entries.map((entry) => ({ id: entry.id, category: entry.category, title: entry.title, text: plainText(entry.detail), properties: entry.properties })),
        }),
      });
      const data = await response.json() as AnnualResponse & { error?: string };
      if (!response.ok) setError(data.error ?? '초안을 만들지 못했습니다.');
      else setResult(data);
    } catch {
      setError('네트워크 오류로 초안을 만들지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const apply = (item: AnnualItem) => {
    onApply(item);
    setApplied((current) => [...current, item.id]);
  };

  const actionable = result ? result.items.filter((item) => item.action !== 'keep') : [];
  const remaining = actionable.filter((item) => !applied.includes(item.id));

  const applyAll = () => {
    remaining.forEach(onApply);
    setApplied(actionable.map((item) => item.id));
  };

  const countOf = (action: AnnualAction) => result?.items.filter((item) => item.action === action).length ?? 0;

  return <div className="modal-backdrop ho-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="ho-draft-modal" role="dialog" aria-modal="true" aria-labelledby="ho-annual-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
      <div className="ho-draft-head">
        <span className="ho-draft-spark" aria-hidden="true">↻</span>
        <div><span className="modal-label">ANNUAL UPDATE</span><h2 id="ho-annual-title">연간 업데이트 1차 초안</h2><p>지난 학년도 인수인계서를 그대로 두지 않고, 해마다 달라지는 부분만 골라 다음 학년도 초안으로 만들어 드립니다. 최종 확인은 작성자가 합니다.</p></div>
      </div>
      <div className="ho-draft-controls">
        <label><span>기준 학년도</span><select value={year} onChange={(event) => { setYear(Number(event.target.value)); setResult(null); setApplied([]); }} disabled={loading}>{[thisYear - 1, thisYear, thisYear + 1].map((option) => <option value={option} key={option}>{option}학년도 → {option + 1}학년도</option>)}</select></label>
        <button type="button" onClick={generate} disabled={loading || !entries.length}>{loading ? '초안 만드는 중…' : result ? '다시 만들기' : '1차 초안 만들기'}</button>
      </div>

      {loading && <div className="ho-draft-loading"><i /><i /><i /><p>{entries.length}개 항목에서 해마다 달라지는 부분을 찾고 있습니다.</p></div>}
      {error && <p className="ho-draft-error" role="alert">{error}</p>}

      {result && <>
        <div className="ho-annual-summary">
          <p><b>{result.fromYear}학년도 → {result.toYear}학년도</b> · {result.reviewed}개 항목 검토</p>
          <div className="ho-annual-counts">
            <span className="revise">수정 <b>{countOf('revise')}</b></span>
            <span className="new">신규 <b>{countOf('new')}</b></span>
            <span className="archive">제외 <b>{countOf('archive')}</b></span>
            <span className="keep">유지 <b>{countOf('keep')}</b></span>
          </div>
        </div>
        <div className="ho-draft-list">{result.items.map((item) => {
          const meta = categories.find((category) => category.id === item.category)!;
          const isApplied = applied.includes(item.id);
          return <article className={`ho-draft-card ho-annual-card ${item.action} ${isApplied ? 'is-adopted' : ''}`} key={item.id} style={{ '--category': meta.accent, '--category-soft': meta.soft } as React.CSSProperties}>
            <div className="ho-draft-card-head">
              <span className="ho-draft-chip"><i />{meta.short}</span>
              <span className={`ho-annual-action ${item.action}`}>{annualActionLabels[item.action]}</span>
              <small>{item.action === 'new' ? '신규 제안' : `전년도 · ${item.previousTitle}`}</small>
            </div>
            <h4>{item.title}</h4>
            {item.reason && <p className="ho-annual-reason">{item.reason}</p>}
            {Object.keys(item.properties).length > 0 && <div className="ho-draft-properties">{meta.propertyFields.map((field) => item.properties[field.key] && <span key={field.key}><b>{field.label}</b>{item.properties[field.key]}</span>)}</div>}
            {item.detail && item.action !== 'keep' && <div className="ho-draft-body" dangerouslySetInnerHTML={{ __html: item.detail }} />}
            <div className="ho-draft-card-actions">
              {item.action === 'keep'
                ? <span className="ho-annual-hold">그대로 두면 됩니다</span>
                : isApplied
                  ? <span className="ho-draft-done">✓ 반영됨</span>
                  : <button type="button" onClick={() => apply(item)}>{item.action === 'archive' ? '올해 문서에서 제외' : item.action === 'new' ? '항목으로 추가' : '수정 내용 반영'}</button>}
            </div>
          </article>;
        })}</div>
      </>}

      <div className="ho-modal-actions">
        <p><span>ⓘ</span> 날짜를 한 해 뒤로 옮긴 항목은 실제 학사일정과 다를 수 있어 확인 질문이 함께 붙습니다.</p>
        <button type="button" onClick={onClose}>닫기</button>
        <button type="button" onClick={applyAll} disabled={!result || remaining.length === 0}>남은 {remaining.length}건 모두 반영</button>
      </div>
    </section>
  </div>;
}

export default function HandoverWorkspace({ onHome }: { onHome: () => void }) {
  const [tab, setTab] = useState<WorkspaceTab>('write');
  const [activeCategory, setActiveCategory] = useState<HandoverCategory>('responsibility');
  const [entries, setEntries] = useState(initialEntries);
  const [bundles, setBundles] = useState(initialBundles);
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [role, setRole] = useState<'author' | 'manager'>('author');
  const [editor, setEditor] = useState<{ category: HandoverCategory; entry?: HandoverEntry } | null>(null);
  const [expandedBundle, setExpandedBundle] = useState<string | null>('b1');
  const [detailView, setDetailView] = useState<{ bundleId: string; entryId: string } | null>(null);
  const [toast, setToast] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [annualOpen, setAnnualOpen] = useState(false);
  const [quality, setQuality] = useState<QualityResponse | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState('');

  const assignedIds = useMemo(() => new Set(bundles.flatMap((bundle) => bundle.entryIds)), [bundles]);
  const unassignedEntries = entries.filter((entry) => !assignedIds.has(entry.id));
  const activeMeta = categories.find((category) => category.id === activeCategory)!;
  const canSubmit = bundles.length > 0 && entries.length > 0 && unassignedEntries.length === 0 && bundles.every((bundle) => bundle.entryIds.length > 0 && bundle.title.trim());
  const isLocked = status === 'pending' || status === 'approved';
  const detailBundle = detailView ? bundles.find((bundle) => bundle.id === detailView.bundleId) : undefined;
  const detailEntry = detailView ? entries.find((entry) => entry.id === detailView.entryId) : undefined;

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  };

  const saveEntry = (title: string, detail: string, properties: Record<string, string>, formatting: EntryFormatting, attachments: EntryAttachment[]) => {
    if (!editor) return;
    if (editor.entry) {
      setEntries((current) => current.map((entry) => entry.id === editor.entry?.id ? { ...entry, title, detail, properties, attachments, formatting } : entry));
      setQuality(null);
      flash('항목을 수정했습니다.');
    } else {
      const id = `${editor.category}-${Date.now()}`;
      setEntries((current) => [...current, { id, category: editor.category, title, detail, properties, attachments, formatting }]);
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
        body: JSON.stringify({ entries: entries.map((entry) => ({ id: entry.id, category: entry.category, title: entry.title, text: plainText(entry.detail) })) }),
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
    setActiveCategory(entry.category);
    setTab('write');
    setEditor({ category: entry.category, entry });
  };

  const removeEntry = (id: string) => {
    entries.find((entry) => entry.id === id)?.attachments.forEach((file) => URL.revokeObjectURL(file.url));
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setBundles((current) => current.map((bundle) => ({ ...bundle, entryIds: bundle.entryIds.filter((entryId) => entryId !== id) })));
    setQuality(null);
    flash('항목을 삭제했습니다.');
  };

  /** Every AI proposal — calendar draft, uploaded document, next-year update — lands here. */
  const adoptProposal = (item: AdoptableItem, message = '초안을 항목으로 추가했습니다.') => {
    const id = `${item.category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEntries((current) => [...current, { id, category: item.category, title: item.title, detail: item.detail, properties: item.properties, attachments: [], formatting: defaultFormatting }]);
    setActiveCategory(item.category);
    setQuality(null);
    flash(message);
  };

  /** Applies one line of next year's draft: rewrite in place, add, or drop the entry. */
  const applyAnnual = (item: AnnualItem) => {
    if (item.action === 'keep') return;
    if (item.action === 'new' || !item.entryId) {
      adoptProposal(item, '이월 항목을 추가했습니다.');
      return;
    }
    if (item.action === 'archive') {
      removeEntry(item.entryId);
      flash('올해 문서에서 제외했습니다.');
      return;
    }
    setEntries((current) => current.map((entry) => entry.id === item.entryId
      ? { ...entry, title: item.title, detail: item.detail, properties: { ...entry.properties, ...item.properties } }
      : entry));
    setActiveCategory(item.category);
    setQuality(null);
    flash('수정 내용을 반영했습니다.');
  };

  const addBundle = () => {
    const id = `bundle-${Date.now()}`;
    setBundles((current) => [...current, { id, title: `새 담당업무 단위 ${current.length + 1}`, entryIds: [], decision: null, comment: '' }]);
    setExpandedBundle(id);
  };

  const toggleEntry = (bundleId: string, entryId: string) => {
    setBundles((current) => current.map((bundle) => {
      if (bundle.id === bundleId) {
        const selected = bundle.entryIds.includes(entryId);
        return { ...bundle, entryIds: selected ? bundle.entryIds.filter((id) => id !== entryId) : [...bundle.entryIds, entryId] };
      }
      return { ...bundle, entryIds: bundle.entryIds.filter((id) => id !== entryId) };
    }));
  };

  const submitHandover = () => {
    if (!canSubmit) return;
    setBundles((current) => current.map((bundle) => ({ ...bundle, decision: null, comment: '' })));
    setStatus('pending');
    setTab('review');
    setRole('author');
    flash('인수인계서를 제출했습니다.');
  };

  const completeReview = () => {
    const reviewReady = bundles.every((bundle) => bundle.decision && (bundle.decision === 'approved' || bundle.comment.trim()));
    if (!reviewReady) return;
    const nextStatus = bundles.some((bundle) => bundle.decision === 'rejected') ? 'rejected' : 'approved';
    setStatus(nextStatus);
    setRole('author');
    flash(nextStatus === 'approved' ? '인수인계가 최종 승인되었습니다.' : '검토 의견과 함께 반려되었습니다.');
  };

  const reopenDraft = () => {
    setTab('write');
    flash('수정 모드로 전환했습니다.');
  };

  return <main className="handover-workspace">
    {toast && <div className="ho-toast"><span>✓</span>{toast}</div>}
    <section className="ho-hero">
      <div className="ho-breadcrumb"><button type="button" onClick={onHome}>홈</button><span>/</span><small>인수인계</small></div>
      <div className="ho-hero-row"><div><span className="ho-kicker">HANDOVER DOCUMENT</span><h1>업무 인수인계서</h1><p>업무를 자유롭게 기록하고, 담당업무 단위로 묶어 완성하세요.</p></div><div className="ho-hero-actions"><StatusBadge status={status} /><div className="ho-role-switch"><button type="button" className={role === 'author' ? 'active' : ''} onClick={() => setRole('author')}>작성자</button><button type="button" className={role === 'manager' ? 'active' : ''} onClick={() => { setRole('manager'); setTab('review'); }}>팀장 검토</button></div></div></div>
      <div className="ho-progress"><button type="button" className={tab === 'write' ? 'active' : ''} onClick={() => { setRole('author'); setTab('write'); }}><i>1</i><span><b>항목 작성</b><small>{entries.length}개 기록됨</small></span></button><em /><button type="button" className={tab === 'compose' ? 'active' : ''} onClick={() => { setRole('author'); setTab('compose'); }}><i>2</i><span><b>업무 단위 조합</b><small>{bundles.length}개 단위</small></span></button><em /><button type="button" className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}><i>3</i><span><b>제출 및 승인</b><small>{status === 'draft' ? '제출 전' : status === 'pending' ? '검토 중' : status === 'rejected' ? '보완 필요' : '처리 완료'}</small></span></button></div>
    </section>

    {role === 'author' && tab === 'write' && <section className="ho-content ho-write-view">
      <div className="ho-section-title"><div><span>STEP 01</span><h2>인수인계 항목 작성</h2><p>순서에 관계없이 필요한 섹션부터 작성할 수 있습니다.</p></div><button type="button" onClick={() => setTab('compose')}>업무 단위 조합하기 <span>→</span></button></div>
      {status === 'rejected' && <div className="ho-reject-banner"><span>!</span><div><b>팀장 검토 후 반려되었습니다.</b><p>아래 항목을 보완한 뒤 업무 단위 조합 화면에서 다시 제출해 주세요.</p></div><button type="button" onClick={() => setTab('review')}>검토 의견 보기</button></div>}
      <div className="ho-ai-panel">
        <div className="ho-ai-panel-head">
          <span className="ho-draft-spark" aria-hidden="true">✦</span>
          <div><b>AI 1차 초안 도우미</b><p>백지에서 시작하지 않아도 됩니다. 아래 세 가지 방법으로 4개 섹션을 채운 뒤 다듬어 주세요.</p></div>
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
          <button type="button" onClick={() => setAnnualOpen(true)} disabled={isLocked || !entries.length}>
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
        <div className="ho-entry-head"><div className="ho-category-icon large"><CategoryIcon category={activeMeta.id} /></div><div><span>SECTION {activeMeta.step}</span><h3>{activeMeta.label}</h3><p>{activeMeta.description}</p></div><button type="button" onClick={() => setEditor({ category: activeMeta.id })} disabled={isLocked}><span>＋</span> 새 항목 추가</button></div>
        <div className="ho-entry-list">{entries.filter((entry) => entry.category === activeMeta.id).map((entry, index) => <article key={entry.id}><span className="ho-entry-number">{String(index + 1).padStart(2, '0')}</span><div><h4>{entry.title}</h4><div className="ho-entry-property-row">{activeMeta.propertyFields.map((field) => entry.properties[field.key] && <span key={field.key}><b>{field.label}</b>{entry.properties[field.key]}</span>)}{entry.detail.includes('<table') && <span className="has-table"><b>문서</b>표 포함</span>}{entry.attachments.length > 0 && <span className="has-file"><b>첨부</b>{entry.attachments.length}개</span>}</div><p>{plainText(entry.detail)}</p><span className="ho-linked">{assignedIds.has(entry.id) ? `업무 단위에 연결됨` : '아직 연결되지 않음'}</span></div><div className="ho-entry-actions"><button type="button" onClick={() => setEditor({ category: activeMeta.id, entry })} disabled={isLocked} aria-label={`${entry.title} 문서 편집`}>문서 편집</button><button type="button" onClick={() => removeEntry(entry.id)} disabled={isLocked} aria-label={`${entry.title} 삭제`}>삭제</button></div></article>)}{entries.every((entry) => entry.category !== activeMeta.id) && <div className="ho-empty"><div className="ho-category-icon"><CategoryIcon category={activeMeta.id} /></div><b>아직 작성된 항목이 없습니다.</b><p>새 항목을 추가해 인수인계를 시작하세요.</p></div>}</div>
      </div>
      <aside className="ho-writing-tip"><span>TIP</span><p>한 항목에는 하나의 주제를 적어두면, 최종 조합 단계에서 여러 담당업무 단위로 정리하기 쉽습니다.</p><div>{categories.map((category) => <span key={category.id}><i style={{ background: category.accent }} />{category.short}<b>{entries.filter((entry) => entry.category === category.id).length}</b></span>)}</div></aside>
    </section>}

    {role === 'author' && tab === 'compose' && <section className="ho-content ho-compose-view">
      <div className="ho-section-title"><div><span>STEP 02</span><h2>담당업무 단위 조합</h2><p>관련 항목을 묶어 하나의 완성된 인수인계 단위로 만드세요.</p></div><button type="button" className="outline" onClick={addBundle} disabled={isLocked}><span>＋</span> 새 업무 단위</button></div>
      <div className="ho-compose-summary"><div><small>작성 항목</small><strong>{entries.length}</strong><span>개</span></div><i /><div><small>업무 단위</small><strong>{bundles.length}</strong><span>개</span></div><i /><div className={unassignedEntries.length ? 'warning' : 'done'}><small>미배치 항목</small><strong>{unassignedEntries.length}</strong><span>개</span></div><p>{unassignedEntries.length ? '모든 항목을 업무 단위에 배치해야 제출할 수 있습니다.' : '모든 항목이 빠짐없이 연결되었습니다.'}</p></div>
      <div className="ho-bundle-list">{bundles.map((bundle, bundleIndex) => <article className={`ho-bundle ${expandedBundle === bundle.id ? 'expanded' : ''}`} key={bundle.id}>
        <div className="ho-bundle-head"><span className="ho-bundle-index">A-{String(bundleIndex + 1).padStart(2, '0')}</span><div><small>담당업무 단위</small><input aria-label="담당업무 단위 이름" value={bundle.title} onChange={(event) => setBundles((current) => current.map((item) => item.id === bundle.id ? { ...item, title: event.target.value } : item))} disabled={isLocked} /></div><div className="ho-bundle-counts">{categories.map((category) => <span key={category.id} style={{ '--category': category.accent } as React.CSSProperties}><i />{bundle.entryIds.filter((id) => entries.find((entry) => entry.id === id)?.category === category.id).length}</span>)}</div><button type="button" onClick={() => setExpandedBundle((current) => current === bundle.id ? null : bundle.id)}>{expandedBundle === bundle.id ? '접기' : '편집'} <span>⌄</span></button></div>
        {expandedBundle === bundle.id && <div className="ho-bundle-body">{categories.map((category) => <div className="ho-pick-column" key={category.id} style={{ '--category': category.accent, '--category-soft': category.soft } as React.CSSProperties}><div><span className="ho-category-icon"><CategoryIcon category={category.id} /></span><b>{category.short}</b><em>복수 선택 가능</em></div>{entries.filter((entry) => entry.category === category.id).map((entry) => {
          const selected = bundle.entryIds.includes(entry.id);
          const assignedElsewhere = !selected && bundles.some((item) => item.id !== bundle.id && item.entryIds.includes(entry.id));
          return <button type="button" key={entry.id} className={selected ? 'selected' : ''} disabled={isLocked || assignedElsewhere} onClick={() => toggleEntry(bundle.id, entry.id)}><i>{selected ? '✓' : ''}</i><span><b>{entry.title}</b>{assignedElsewhere && <small>다른 단위에 배치됨</small>}</span></button>;
        })}</div>)}</div>}
        {expandedBundle === bundle.id && !isLocked && <div className="ho-bundle-footer"><button type="button" onClick={() => { setBundles((current) => current.filter((item) => item.id !== bundle.id)); setExpandedBundle(null); }}>업무 단위 삭제</button><span>선택한 항목 <b>{bundle.entryIds.length}개</b></span></div>}
      </article>)}{bundles.length === 0 && <div className="ho-empty-bundle"><b>아직 만들어진 담당업무 단위가 없습니다.</b><p>새 업무 단위를 만들고 작성한 항목을 자유롭게 조합해 주세요.</p><button type="button" onClick={addBundle}>＋ 첫 업무 단위 만들기</button></div>}</div>
      <div className="ho-quality">
        <div className="ho-quality-head">
          <span className="ho-quality-icon" aria-hidden="true">✓</span>
          <div><b>제출 전 점검</b><p>후임자가 이 문서만 보고 업무를 이어받을 수 있는지 확인합니다. 점검하지 않아도 제출할 수 있습니다.</p></div>
          <button type="button" onClick={runQualityCheck} disabled={qualityLoading || isLocked || !entries.length}>{qualityLoading ? '점검하는 중…' : quality ? '다시 점검' : '점검 실행'}</button>
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
      <div className="ho-submit-bar"><div><span>{canSubmit ? '✓' : '!'}</span><p><b>{canSubmit ? '제출 준비가 완료되었습니다.' : '아직 제출할 수 없습니다.'}</b><small>{canSubmit ? `${bundles.length}개 담당업무 단위 · 총 ${entries.length}개 항목` : '미배치 항목과 비어 있는 업무 단위를 확인해 주세요.'}</small></p></div><button type="button" disabled={!canSubmit || isLocked} onClick={submitHandover}>{status === 'pending' ? '검토 대기 중' : status === 'approved' ? '승인 완료' : '팀장에게 제출'} <span>→</span></button></div>
    </section>}

    {tab === 'review' && <section className="ho-content ho-review-view">
      <div className="ho-section-title"><div><span>STEP 03</span><h2>{role === 'manager' ? '인수인계 검토' : '제출 및 승인 현황'}</h2><p>{role === 'manager' ? '담당업무 단위별로 승인하거나 보완 의견을 남겨 주세요.' : '팀장 검토 상태와 업무 단위별 의견을 확인하세요.'}</p></div>{role === 'author' && status === 'pending' && <button className="outline" type="button" onClick={() => setRole('manager')}>팀장 검토 화면 보기 <span>→</span></button>}</div>
      {status === 'draft' && <div className="ho-review-empty"><div>03</div><span>SUBMISSION REQUIRED</span><h3>아직 제출된 인수인계서가 없습니다.</h3><p>항목을 업무 단위로 조합한 뒤 팀장에게 제출해 주세요.</p><button type="button" onClick={() => { setRole('author'); setTab('compose'); }}>조합 화면으로 이동 <span>→</span></button></div>}
      {status !== 'draft' && <>
        <div className={`ho-review-banner ${status}`}><div className="ho-review-symbol">{status === 'pending' ? '⌛' : status === 'approved' ? '✓' : '!'}</div><div><span>{status === 'pending' ? 'REVIEW IN PROGRESS' : status === 'approved' ? 'HANDOVER APPROVED' : 'REVISION REQUESTED'}</span><h3>{status === 'pending' ? (role === 'manager' ? '검토할 인수인계서가 도착했습니다.' : '팀장 검토를 기다리고 있습니다.') : status === 'approved' ? '인수인계가 정상적으로 승인되었습니다.' : '보완 후 다시 제출해 주세요.'}</h3><p>{status === 'pending' ? `담당업무 ${bundles.length}개 단위 · 총 ${entries.length}개 항목` : status === 'approved' ? '승인 절차가 완료되어 인수인계가 정상 처리되었습니다.' : '반려된 담당업무 단위의 코멘트를 확인하고 내용을 수정할 수 있습니다.'}</p></div><StatusBadge status={status} /></div>
        <div className="ho-review-layout"><div className="ho-review-bundles">{bundles.map((bundle, index) => <article className={`ho-review-card ${bundle.decision ?? ''}`} key={bundle.id}>
          <div className="ho-review-card-head"><span>A-{String(index + 1).padStart(2, '0')}</span><div><small>담당업무 단위</small><h3>{bundle.title}</h3></div><div>{categories.map((category) => <span key={category.id} style={{ '--category': category.accent } as React.CSSProperties}><i />{bundle.entryIds.filter((id) => entries.find((entry) => entry.id === id)?.category === category.id).length}</span>)}</div>{bundle.decision && <b className={bundle.decision}>{bundle.decision === 'approved' ? '승인' : '반려'}</b>}</div>
          <BundleReadOnly bundle={bundle} entries={entries} onOpenEntry={(entryId) => setDetailView({ bundleId: bundle.id, entryId })} />
          {role === 'manager' && status === 'pending' && <div className="ho-manager-decision"><div><span>검토 결과</span><button type="button" className={bundle.decision === 'approved' ? 'active approve' : ''} onClick={() => setBundles((current) => current.map((item) => item.id === bundle.id ? { ...item, decision: 'approved', comment: '' } : item))}>✓ 승인</button><button type="button" className={bundle.decision === 'rejected' ? 'active reject' : ''} onClick={() => setBundles((current) => current.map((item) => item.id === bundle.id ? { ...item, decision: 'rejected' } : item))}>↩ 반려</button></div>{bundle.decision === 'rejected' && <label>보완 요청 코멘트 <span>*</span><textarea value={bundle.comment} onChange={(event) => setBundles((current) => current.map((item) => item.id === bundle.id ? { ...item, comment: event.target.value } : item))} placeholder="이 담당업무 단위에서 보완해야 할 내용을 구체적으로 적어주세요." rows={3} /></label>}</div>}
          {role === 'author' && bundle.decision === 'rejected' && bundle.comment && <div className="ho-manager-comment"><span>팀장 코멘트</span><p>{bundle.comment}</p></div>}
        </article>)}</div>
        <aside className="ho-review-side"><span>DOCUMENT INFO</span><h3>제출 정보</h3><dl><div><dt>작성자</dt><dd>김지현</dd></div><div><dt>소속</dt><dd>국제처</dd></div><div><dt>담당업무 단위</dt><dd>{bundles.length}개</dd></div><div><dt>전체 항목</dt><dd>{entries.length}개</dd></div><div><dt>제출일</dt><dd>2026. 08. 27</dd></div></dl>{role === 'manager' && status === 'pending' && <div className="ho-review-guide"><b>검토 안내</b><p>모든 담당업무 단위에 승인 또는 반려를 선택해야 검토를 완료할 수 있습니다. 반려 시 코멘트는 필수입니다.</p></div>}</aside></div>
        {role === 'manager' && status === 'pending' && <div className="ho-review-submit"><div><b>{bundles.filter((bundle) => bundle.decision).length} / {bundles.length}</b><span>업무 단위 검토 완료</span></div><button type="button" onClick={completeReview} disabled={!bundles.every((bundle) => bundle.decision && (bundle.decision === 'approved' || bundle.comment.trim()))}>검토 완료 및 결과 전송 <span>→</span></button></div>}
        {role === 'author' && status === 'rejected' && <div className="ho-resubmit"><div><span>↻</span><p><b>수정 후 다시 제출할 수 있습니다.</b><small>기존 항목과 조합은 그대로 유지되며, 필요한 내용만 보완하면 됩니다.</small></p></div><button type="button" onClick={reopenDraft}>수정 시작하기 <span>→</span></button></div>}
      </>}
    </section>}
    {draftOpen && <DraftModal onAdopt={adoptProposal} onClose={() => setDraftOpen(false)} />}
    {importOpen && <ImportModal onAdopt={(item) => adoptProposal(item, '분류된 항목을 추가했습니다.')} onClose={() => setImportOpen(false)} />}
    {annualOpen && <AnnualModal entries={entries} onApply={applyAnnual} onClose={() => setAnnualOpen(false)} />}
    {editor && <EntryEditor category={categories.find((category) => category.id === editor.category)!} entry={editor.entry} onSave={saveEntry} onClose={() => setEditor(null)} />}
    {detailBundle && detailEntry && <EntryDetailModal entry={detailEntry} bundle={detailBundle} entries={entries} onSelect={(entryId) => setDetailView({ bundleId: detailBundle.id, entryId })} onClose={() => setDetailView(null)} />}
  </main>;
}
