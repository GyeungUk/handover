'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { documentLimits, type EntryAttachment, type EntryFormatting, type HandoverEntry } from '../handover-schema';
import { AttachmentAction, CategoryIcon } from './atoms';
import { type CategoryMeta, defaultFormatting, fontStack } from './categories';
import { fileKind, formatBytes, plainText } from './format';
import { Button, Modal } from '../ui';

export default function EntryEditor({ category, entry, onSave, onClose }: { category: CategoryMeta; entry?: HandoverEntry; onSave: (title: string, detail: string, properties: Record<string, string>, formatting: EntryFormatting, attachments: EntryAttachment[]) => void; onClose: () => void }) {
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
    const room = documentLimits.attachmentsPerEntry - attachments.length;
    if (room <= 0) {
      setAttachmentError(`첨부파일은 항목당 최대 ${documentLimits.attachmentsPerEntry}개까지 올릴 수 있습니다.`);
      return;
    }
    const oversized = incoming.filter((file) => file.size > documentLimits.attachmentBytes);
    const accepted = incoming.filter((file) => file.size <= documentLimits.attachmentBytes).slice(0, room);
    setAttachments((current) => [...current, ...accepted.map((file) => {
      const url = URL.createObjectURL(file);
      createdUrls.current.add(url);
      return { id: `file-${crypto.randomUUID()}`, name: file.name, size: file.size, type: file.type, url };
    })]);
    setAttachmentError(oversized.length
      ? `${oversized[0].name} 등 ${oversized.length}개 파일이 ${formatBytes(documentLimits.attachmentBytes)}를 넘어 제외되었습니다.`
      : incoming.length > accepted.length ? `최대 ${documentLimits.attachmentsPerEntry}개까지만 추가했습니다.` : '');
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
  /* The form lives inside the dialog body rather than wrapping it, so the
     submit button can sit in the footer and still submit — that is what
     `form=` is for, and it keeps the sheet's commit bar where a phone expects
     it. Closing goes through `discardAndClose` on every path, including the
     backdrop, because the object URLs of picked files have to be revoked. */
  return <Modal
    onClose={discardAndClose}
    width="lg"
    className="ho-entry-modal"
    head={<header className="ui-modal-head ho-editor-heading">
      <div className="ho-modal-icon"><CategoryIcon category={category.id} /></div>
      <div>
        <span className="ho-step">{entry ? '문서 수정' : '새 문서'} · {category.step}번 섹션</span>
        <h2 className="ui-h2" id="ho-editor-title">{category.label}</h2>
        <p className="ui-text sm muted">{category.description}</p>
      </div>
      <span className="ho-autosave"><i /> 임시 저장됨</span>
      <button className="ui-modal-close" type="button" onClick={discardAndClose} aria-label="닫기">×</button>
    </header>}
    labelledBy="ho-editor-title"
    stackFooter
    footer={<>
      <p className="ho-modal-note"><span aria-hidden="true">ⓘ</span> 작성한 서식과 표, 첨부파일은 제출 문서에도 그대로 표시됩니다.</p>
      <span className="spacer" />
      <Button onClick={discardAndClose}>취소</Button>
      <Button variant="primary" type="submit" form="ho-entry-form" disabled={!title.trim() || !hasContent}>
        {entry ? '문서 저장' : '항목 추가'}
      </Button>
    </>}
  >
    <form id="ho-entry-form" onSubmit={submit} style={{ '--category': category.accent, '--category-soft': category.soft } as CSSProperties}>
      <label className="ho-title-field">문서 제목<span>*</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={category.placeholder} maxLength={documentLimits.entryTitle} /></label>
      <fieldset className="ho-property-fields"><legend>문서 속성</legend>{category.propertyFields.map((field) => <label key={field.key}><span>{field.label}</span>{field.options ? <select value={properties[field.key] ?? ''} onChange={(event) => setProperties((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">{field.placeholder}</option>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input value={properties[field.key] ?? ''} maxLength={documentLimits.propertyValue} onChange={(event) => setProperties((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} />}</label>)}</fieldset>
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
        <div ref={editorRef} className="ho-rich-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="인수인계 본문" aria-multiline="true" aria-required="true" tabIndex={0} data-placeholder="다음 담당자가 바로 업무를 이어갈 수 있도록 내용을 작성하세요. 표, 목록, 강조 서식을 함께 사용할 수 있습니다." style={{ fontFamily: fontStack(formatting.fontFamily), fontSize: `${formatting.fontSize}px` }} onInput={syncEditorValue} />
        <div className="ho-editor-status"><span>▦ 표 삽입 가능</span><span>{contentLength}자</span></div>
      </div>
      <div className="ho-attach-block">
        <div className="ho-document-label"><span>첨부파일</span><small>최대 {documentLimits.attachmentsPerEntry}개 · 파일당 {formatBytes(documentLimits.attachmentBytes)}까지</small></div>
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
          <AttachmentAction file={file} label="열기" />
          <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`${file.name} 첨부 삭제`}>삭제</button>
        </li>)}</ul>}
      </div>
    </form>
  </Modal>;
}
