'use client';

import { useRef, useState, type CSSProperties } from 'react';
import type { HandoverCategory, ImportItem, ImportResponse } from '../../handover-schema';
import { acceptedImportTypes, extractText, supportedNote } from '../../file-text';
import { categories } from '../categories';
import { Button, Modal } from '../../ui';

export default function ImportModal({ onAdopt, onClose }: { onAdopt: (item: ImportItem) => void; onClose: () => void }) {
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [adopted, setAdopted] = useState<string[]>([]);
  /* The author's own correction of a section the model chose, kept until the modal closes. */
  const [moved, setMoved] = useState<Record<string, HandoverCategory>>({});
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setResult(null); setAdopted([]); setMoved({}); setError(''); };

  /** The section a card is in: the author's correction when they made one, else the model's. */
  const sectionOf = (item: ImportItem) => moved[item.id] ?? item.category;

  /**
   * The item as the author filed it. Property fields belong to a section, so moving a card drops
   * the values the new section has no field for rather than carrying keys the editor cannot show.
   */
  const filed = (item: ImportItem): ImportItem => {
    const category = sectionOf(item);
    if (category === item.category) return item;
    const fields = new Set(categories.find((meta) => meta.id === category)!.propertyFields.map((field) => field.key));
    return {
      ...item,
      category,
      properties: Object.fromEntries(Object.entries(item.properties).filter(([key]) => fields.has(key))),
    };
  };

  /** "원문을 그대로 옮긴 항목 4건 · 근거를 확인하지 못한 항목 2건" */
  const skippedNote = (skipped: ImportResponse['skipped']) =>
    (skipped ?? []).map((entry) => `${entry.reason} ${entry.count}건`).join(' · ');

  const takeFile = async (file: File | null | undefined) => {
    if (!file) return;
    setReading(true);
    reset();
    setSource('');
    setFileName(file.name);
    try {
      const text = await extractText(file);
      if (text.trim().length < 30) throw new Error('파일에서 읽어낸 내용이 너무 짧습니다. 문서 내용을 복사해 아래에 붙여넣어 주세요.');
      setSource(text);
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
      else if (!data.items.length) {
        /* Naming what was thrown away beats "찾지 못했습니다" when a deck yields only pasted text. */
        const note = skippedNote(data.skipped);
        setError(note
          ? `제안된 내용이 모두 걸러졌습니다: ${note}. 발표자료처럼 표·그림 위주의 문서라면 설명 문장이 있는 부분을 붙여넣어 다시 시도해 주세요.`
          : '네 개 섹션에 넣을 만한 내용을 찾지 못했습니다. 자료를 확인해 주세요.');
      } else setResult(data);
    } catch {
      setError('네트워크 오류로 분류하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const adopt = (item: ImportItem) => {
    onAdopt(filed(item));
    setAdopted((current) => [...current, item.id]);
  };

  const adoptAll = () => {
    if (!result) return;
    result.items.filter((item) => !adopted.includes(item.id)).forEach((item) => onAdopt(filed(item)));
    setAdopted(result.items.map((item) => item.id));
  };

  const remaining = result ? result.items.filter((item) => !adopted.includes(item.id)).length : 0;
  const ready = source.trim().length >= 30;

  return <Modal
    onClose={onClose}
    width="lg"
    className="ho-draft-modal"
    dismissable={!loading && !reading}
    title="기존 자료 불러오기"
    description="예전에 쓰던 인수인계 문서를 올리면 담당업무·계획·현안·미결 네 개 섹션으로 나누어 초안을 제안합니다. 섹션은 채택 전에 카드에서 바꿀 수 있고, 채택하기 전까지 아무것도 저장되지 않습니다."
    footer={<>
      <p className="ho-modal-note"><span aria-hidden="true">ⓘ</span> 원문에 없는 내용은 만들지 않습니다. 비어 있는 부분은 ‘확인이 필요한 내용’ 질문으로 남습니다.</p>
      <span className="spacer" />
      <Button onClick={onClose}>닫기</Button>
      <Button variant="primary" onClick={adoptAll} disabled={!result || remaining === 0}>남은 {remaining}건 모두 채택</Button>
    </>}
  >

      <div className="ho-import-input">
        <div
          className={`ho-dropzone ${dropActive ? 'active' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDropActive(true); }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(event) => { event.preventDefault(); setDropActive(false); void takeFile(event.dataTransfer.files?.[0]); }}
        >
          <span className="ho-dropzone-icon" aria-hidden="true">⇪</span>
          <p><b>{reading ? '파일을 읽는 중입니다…' : '기존 인수인계 자료를 끌어다 놓으세요'}</b><small>{supportedNote} 표와 시트의 내용도 함께 분석합니다.</small></p>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={reading || loading}>파일 선택</button>
          <input ref={fileInputRef} type="file" hidden accept={acceptedImportTypes} onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }} />
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
          {skippedNote(result.skipped) && <p className="ho-import-skipped">초안에 넣지 않은 제안: {skippedNote(result.skipped)}</p>}
          <div className="ho-import-counts">{categories.map((category) => {
            const count = result.items.filter((item) => sectionOf(item) === category.id).length;
            return <span key={category.id} className={count ? '' : 'empty'} style={{ '--category': category.accent, '--category-soft': category.soft } as CSSProperties}><i />{category.short}<b>{count}</b></span>;
          })}</div>
        </div>
        {result.unmapped.length > 0 && <div className="ho-import-unmapped"><b>섹션에 넣지 못한 내용</b><ul>{result.unmapped.map((line) => <li key={line}>{line}</li>)}</ul></div>}
        <div className="ho-draft-list">{result.items.map((item) => {
          const meta = categories.find((category) => category.id === sectionOf(item))!;
          const isAdopted = adopted.includes(item.id);
          return <article className={`ho-draft-card ${isAdopted ? 'is-adopted' : ''}`} key={item.id} style={{ '--category': meta.accent, '--category-soft': meta.soft } as CSSProperties}>
            <div className="ho-draft-card-head">
              <label className="ho-draft-chip ho-import-section">
                <i /><span className="sr-only">섹션</span>
                <select value={sectionOf(item)} disabled={isAdopted}
                  onChange={(event) => setMoved((current) => ({ ...current, [item.id]: event.target.value as HandoverCategory }))}>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.short}</option>)}
                </select>
              </label>
              <span className={`ho-draft-basis ${item.confidence === 'high' ? 'record' : 'inferred'}`}>{item.confidence === 'high' ? '섹션 확실' : '섹션 확인 필요'}</span>
              <small>{item.sourceQuote ? '원문 근거 확인됨' : '원문 요약'}</small>
            </div>
            <h4>{item.title}</h4>
            {Object.keys(filed(item).properties).length > 0 && <div className="ho-draft-properties">{meta.propertyFields.map((field) => item.properties[field.key] && <span key={field.key}><b>{field.label}</b>{item.properties[field.key]}</span>)}</div>}
            <div className="ho-draft-body" dangerouslySetInnerHTML={{ __html: item.detail }} />
            {item.sourceQuote && <p className="ho-import-quote"><span>원문</span>“{item.sourceQuote}”</p>}
            <div className="ho-draft-card-actions">
              {isAdopted ? <span className="ho-draft-done">✓ 항목으로 추가됨</span> : <button type="button" onClick={() => adopt(item)}>이 항목 채택</button>}
            </div>
          </article>;
        })}</div>
      </>}

  </Modal>;
}
