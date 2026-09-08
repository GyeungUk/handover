'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { HandoverCategory, ImportItem, ImportResponse, ImportWorkflowGroup } from '../../handover-schema';
import { acceptedImportTypes, extractText, supportedNote } from '../../file-text';
import { categories } from '../categories';
import { Button, Modal } from '../../ui';

/**
 * The cards grouped under the work unit that runs them, in execution order.
 *
 * `unitTitle` is the name the card is filed under when it is adopted, and it is empty for the
 * leftovers: a card the answer never placed has no unit to belong to, and inventing one would put
 * the author's document in a shape the source does not support. Dependencies are re-sorted here so
 * an older server that returns the phases in document order still reads as a sequence.
 */
function workflowSections(result: ImportResponse) {
  const pending = [...(result.workflowGroups ?? [])];
  const known = new Set(pending.map((group) => group.id));
  const ordered: ImportWorkflowGroup[] = [];
  const completed = new Set<string>();
  while (pending.length) {
    const ready = pending.findIndex((group) => group.after.every((id) => completed.has(id) || !known.has(id)));
    const [group] = pending.splice(ready < 0 ? 0 : ready, 1);
    ordered.push(group);
    completed.add(group.id);
  }
  const assigned = new Set<string>();
  const sections = ordered.map((group) => {
    const ids = new Set(group.itemIds);
    const items = result.items.filter((item) => !assigned.has(item.id) && (ids.has(item.id) || item.workflowId === group.id));
    items.forEach((item) => assigned.add(item.id));
    return { ...group, items, unitTitle: group.title };
  }).filter((group) => group.items.length > 0);
  const unassigned = result.items.filter((item) => !assigned.has(item.id));
  if (unassigned.length) {
    sections.push({
      id: 'unassigned', title: ordered.length ? '업무단위 연결 확인 필요' : '',
      itemIds: unassigned.map((item) => item.id), after: [], items: unassigned, unitTitle: '',
    });
  }
  return sections;
}

export default function ImportModal({ onAdopt, onClose }: { onAdopt: (item: ImportItem, workUnit: string) => void | Promise<void>; onClose: () => void }) {
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [adopted, setAdopted] = useState<string[]>([]);
  const [adopting, setAdopting] = useState('');
  const [moved, setMoved] = useState<Record<string, HandoverCategory>>({});
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Synchronous locks also cover a second event arriving before React paints disabled controls.
  const busyRef = useRef(false);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const adoptedIds = useRef(new Set<string>());
  const busy = reading || loading || Boolean(adopting);

  useEffect(() => () => {
    requestVersion.current += 1;
    activeRequest.current?.abort();
  }, []);

  const reset = () => {
    setResult(null);
    adoptedIds.current.clear();
    setAdopted([]);
    setMoved({});
    setError('');
  };

  const sectionOf = (item: ImportItem) => moved[item.id] ?? item.category;

  /** Moving a card drops property keys that its new section cannot show. */
  const filed = (item: ImportItem): ImportItem => {
    const category = sectionOf(item);
    if (category === item.category) return item;
    const fields = new Set(categories.find((meta) => meta.id === category)!.propertyFields.map((field) => field.key));
    return { ...item, category, properties: Object.fromEntries(Object.entries(item.properties).filter(([key]) => fields.has(key))) };
  };

  const skippedNote = (skipped: ImportResponse['skipped']) =>
    (skipped ?? []).map((entry) => `${entry.reason} ${entry.count}건`).join(' · ');

  const takeFile = async (file: File | null | undefined) => {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    const version = ++requestVersion.current;
    setReading(true);
    reset();
    setSource('');
    setFileName(file.name);
    try {
      const text = await extractText(file);
      if (version !== requestVersion.current) return;
      if (text.trim().length < 30) throw new Error('파일에서 읽어낸 내용이 너무 짧습니다. 문서 내용을 복사해 아래에 붙여넣어 주세요.');
      setSource(text);
    } catch (failure) {
      if (version === requestVersion.current) setError(failure instanceof Error ? failure.message : '파일을 읽지 못했습니다.');
    } finally {
      if (version === requestVersion.current) {
        busyRef.current = false;
        setReading(false);
      }
    }
  };

  const classify = async () => {
    if (busyRef.current || source.trim().length < 30) return;
    busyRef.current = true;
    const version = ++requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setDropActive(false);
    reset();
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, fileName: fileName || '붙여넣은 내용' }),
        signal: controller.signal,
      });
      const data = await response.json() as ImportResponse & { error?: string };
      if (version !== requestVersion.current) return;
      if (!response.ok) setError(data.error ?? '업무 구조화에 실패했습니다.');
      else if (!Array.isArray(data.items)) setError('분석 결과를 읽지 못했습니다. 다시 시도해 주세요.');
      else {
        // Preserve verification and omissions even when every proposed card was rejected.
        setResult(data);
        if (!data.items.length) {
          const note = skippedNote(data.skipped);
          setError(note
            ? `제안된 내용이 모두 걸러졌습니다: ${note}. 원문 반영 검증을 확인하고 업무 설명이 있는 자료로 다시 시도해 주세요.`
            : '업무로 정리할 내용을 찾지 못했습니다. 자료와 원문 반영 검증을 확인해 주세요.');
        }
      }
    } catch {
      if (version === requestVersion.current && !controller.signal.aborted) setError('네트워크 오류로 업무를 정리하지 못했습니다.');
    } finally {
      if (version === requestVersion.current) {
        activeRequest.current = null;
        busyRef.current = false;
        setLoading(false);
      }
    }
  };

  const sections = result ? workflowSections(result) : [];

  const markAdopted = (id: string) => {
    adoptedIds.current.add(id);
    setAdopted((current) => current.includes(id) ? current : [...current, id]);
  };

  const adopt = async (item: ImportItem, workUnit: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const version = requestVersion.current;
    setAdopting(item.id);
    setError('');
    try {
      await onAdopt(filed(item), workUnit);
      if (version === requestVersion.current) markAdopted(item.id);
    } catch (failure) {
      if (version === requestVersion.current) setError(failure instanceof Error ? failure.message : '정리된 항목을 추가하지 못했습니다.');
    } finally {
      if (version === requestVersion.current) {
        busyRef.current = false;
        setAdopting('');
      }
    }
  };

  const adoptAll = async () => {
    if (!result || busyRef.current) return;
    busyRef.current = true;
    const version = requestVersion.current;
    setAdopting('all');
    setError('');
    try {
      /* Adopted in flow order, so the units are created in the order the work runs. */
      for (const { item, workUnit } of sections.flatMap((section) =>
        section.items.map((item) => ({ item, workUnit: section.unitTitle })))) {
        if (version !== requestVersion.current) return;
        if (adoptedIds.current.has(item.id)) continue;
        await onAdopt(filed(item), workUnit);
        if (version !== requestVersion.current) return;
        // Commit progress per successful item so retrying a partial failure never saves it again.
        markAdopted(item.id);
      }
    } catch (failure) {
      if (version === requestVersion.current) {
        const message = failure instanceof Error ? failure.message : '정리된 항목을 추가하지 못했습니다.';
        setError(`${message} 이미 추가된 항목은 유지됩니다. ‘남은 항목 모두 채택’으로 이어서 추가할 수 있습니다.`);
      }
    } finally {
      if (version === requestVersion.current) {
        busyRef.current = false;
        setAdopting('');
      }
    }
  };

  const remaining = result ? result.items.filter((item) => !adopted.includes(item.id)).length : 0;
  const ready = source.trim().length >= 30;
  const groups = sections.filter((section) => section.id !== 'unassigned');
  const groupTitles = new Map(groups.map((group) => [group.id, group.title]));
  const verification = result?.verification;

  return <Modal
    onClose={onClose}
    width="lg"
    className="ho-draft-modal ho-import-modal"
    dismissable={!busy}
    title="기존 자료 불러오기"
    description="문서와 일정표를 실행 가능한 업무단위로 묶고, 업무 순서·마감·주의사항·확인 질문을 정리합니다. 업무 흐름과 원문 반영 결과를 검토한 뒤 필요한 항목을 채택하세요."
    footer={<>
      <p className="ho-modal-note"><span aria-hidden="true">ⓘ</span> 원문에 없는 실행 정보는 ‘확인 필요’ 질문으로 구분합니다.</p>
      <span className="spacer" />
      <Button onClick={onClose} disabled={busy}>닫기</Button>
      <Button variant="primary" onClick={() => void adoptAll()} disabled={!result || remaining === 0 || busy}>{adopting === 'all' ? `추가하는 중… ${result ? result.items.length - remaining : 0}/${result?.items.length ?? 0}` : `남은 ${remaining}건 모두 채택`}</Button>
    </>}
  >
    <div className="ho-import-input" aria-busy={reading || loading}>
      <div
        className={`ho-dropzone ${dropActive ? 'active' : ''} ${busy ? 'is-disabled' : ''}`}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; if (!busy) setDropActive(true); }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => { event.preventDefault(); setDropActive(false); if (!busyRef.current) void takeFile(event.dataTransfer.files?.[0]); }}
      >
        <span className="ho-dropzone-icon" aria-hidden="true">⇪</span>
        <p><b>{reading ? '파일을 읽는 중입니다…' : '기존 인수인계 자료를 끌어다 놓으세요'}</b><small>{supportedNote} 표와 시트의 내용도 함께 분석합니다.</small></p>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>파일 선택</button>
        <input ref={fileInputRef} type="file" hidden disabled={busy} accept={acceptedImportTypes} onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
      <label className="ho-import-paste">
        <span>또는 문서 내용을 그대로 붙여넣기</span>
        <textarea value={source} disabled={busy} onChange={(event) => { if (busyRef.current) return; requestVersion.current += 1; setSource(event.target.value); setFileName(''); reset(); }} rows={5} placeholder={'예)\n담당업무: 외국인 유학생 체류·비자 관리\n2학기 연장 단체접수 진행 중 (84명 중 71명 서류 검토 완료)\n재정증명 보완 대상 2명 회신 지연\n출입국 방문 일정 미확정'} />
      </label>
      <div className="ho-import-actions">
        <small>{fileName ? `${fileName} · ${source.length.toLocaleString()}자 읽음` : source.trim() ? `${source.length.toLocaleString()}자 입력됨` : '아직 읽어들인 내용이 없습니다.'}</small>
        <button type="button" onClick={() => void classify()} disabled={!ready || busy}>{loading ? '업무를 정리하는 중…' : result ? '다시 정리' : '업무 구조화 시작'}</button>
      </div>
    </div>

    {loading && <div className="ho-draft-loading" role="status"><i /><i /><i /><p>본문과 일정표를 연결하고, 업무 흐름과 원문 누락을 검증하고 있습니다.</p></div>}
    {error && <p className="ho-draft-error" role="alert">{error}</p>}

    {result && <>
      <div className="ho-import-summary" role="status">
        <p><b>{result.fileName}</b> · {result.charCount.toLocaleString()}자에서 {groups.length > 0 ? `${groups.length}개 업무단위 · ` : ''}{result.items.length}개 항목을 정리했습니다.</p>
        {skippedNote(result.skipped) && <p className="ho-import-skipped">초안에 넣지 않은 제안: {skippedNote(result.skipped)}</p>}
        <div className="ho-import-counts">{categories.map((category) => {
          const count = result.items.filter((item) => sectionOf(item) === category.id).length;
          return <span key={category.id} className={count ? '' : 'empty'} style={{ '--category': category.accent, '--category-soft': category.soft } as CSSProperties}><i />{category.short}<b>{count}</b></span>;
        })}</div>
        <p className="ho-import-classification-note">현재 발생한 문제와 미결 건은 원문에 명시된 경우에만 제안합니다. 조건부 위험과 확인 질문은 각 업무에 포함됩니다.</p>
      </div>

      {groups.length > 0 && <section className="ho-import-workflow" aria-label="업무 흐름">
        <div className="ho-import-section-heading"><h3>업무 흐름</h3><span>{groups.length}개 업무단위</span></div>
        <ol>{groups.map((group, index) => <li key={group.id}>
          <span className="ho-import-step-number" aria-hidden="true">{index + 1}</span>
          <div>
            <h4><a href={`#import-group-${group.id}`}>{group.title}</a></h4>
            <p className="ho-import-dependency">{group.after.length ? `선행 업무: ${group.after.map((id) => groupTitles.get(id) ?? '연결 확인 필요').join(' · ')}` : '시작 업무 · 선행 업무 지정 없음'}</p>
            <ul>{group.items.map((item) => <li key={item.id}><a href={`#import-item-${item.id}`}>{item.title}</a><span>{categories.find((category) => category.id === sectionOf(item))!.short}</span></li>)}</ul>
          </div>
        </li>)}</ol>
      </section>}

      {verification && <section className={`ho-import-verification ${verification.uncovered.length || verification.warnings.length ? 'needs-review' : ''}`} aria-label="원문 반영 검증">
        <div className="ho-import-section-heading"><h3>원문 반영 검증</h3><span>{verification.coveredCount}/{verification.sourceCount}개 원문 단위 연결</span></div>
        <p>목차·본문·일정표의 원문 근거가 업무에 연결되었는지 점검한 결과입니다.</p>
        {verification.uncovered.length > 0 && <div className="ho-import-verification-findings">
          <h4>반영하지 못한 원문 {verification.uncovered.length}건</h4>
          <ul>{verification.uncovered.map((entry, index) => <li key={`${entry.sourceId}-${index}`}><blockquote>{entry.excerpt}</blockquote><p>{entry.reason}</p></li>)}</ul>
        </div>}
        {verification.warnings.length > 0 && <div className="ho-import-verification-findings"><h4>검토할 내용</h4><ul>{verification.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
        {verification.uncovered.length === 0 && verification.warnings.length === 0 && <p className="ho-import-verified">모든 원문 단위가 연결되었으며, 누락·중복·분류 검증에서 추가 검토 사항이 없습니다.</p>}
      </section>}

      {(result.unmapped ?? []).length > 0 && <div className="ho-import-unmapped"><b>섹션에 넣지 못한 내용</b><ul>{result.unmapped.map((line, index) => <li key={index}>{line}</li>)}</ul></div>}
      <div className="ho-import-results">{sections.map((group, groupIndex) => <section key={group.id} id={`import-group-${group.id}`} className="ho-import-result-group" aria-label={group.title || '정리된 항목'}>
        {group.title && <div className="ho-import-result-heading"><span>{group.id === 'unassigned' ? '확인 필요' : `업무단위 ${groupIndex + 1}`}</span><h3>{group.title}</h3><small>{group.items.length}개 항목</small></div>}
        <div className="ho-draft-list">{group.items.map((item) => {
          const meta = categories.find((category) => category.id === sectionOf(item))!;
          const isAdopted = adopted.includes(item.id);
          const evidence = item.evidence?.length ? item.evidence : item.sourceQuote ? [{ sourceId: '', quote: item.sourceQuote }] : [];
          return <article id={`import-item-${item.id}`} className="ho-draft-card" key={item.id} style={{ '--category': meta.accent, '--category-soft': meta.soft } as CSSProperties}>
            <div className="ho-draft-card-head">
              <label className="ho-draft-chip ho-import-section">
                <i /><span className="sr-only">{item.title} 섹션</span>
                <select value={sectionOf(item)} disabled={busy} onChange={(event) => setMoved((current) => ({ ...current, [item.id]: event.target.value as HandoverCategory }))}>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.short}</option>)}
                </select>
              </label>
              <span className={`ho-draft-basis ${item.confidence === 'high' ? 'record' : 'inferred'}`}>{item.confidence === 'high' ? '섹션 확실' : '섹션 확인 필요'}</span>
              <small>{evidence.length ? `원문 근거 ${evidence.length}건` : '원문 요약'}</small>
            </div>
            <h4>{item.title}</h4>
            {Object.keys(filed(item).properties).length > 0 && <div className="ho-draft-properties">{meta.propertyFields.map((field) => item.properties[field.key] && <span key={field.key}><b>{field.label}</b>{item.properties[field.key]}</span>)}</div>}
            <div className="ho-draft-body" dangerouslySetInnerHTML={{ __html: item.detail }} />
            {evidence.length > 0 && <details className="ho-import-evidence"><summary>연결된 원문 근거 {evidence.length}건 보기</summary>{evidence.map((entry, index) => <blockquote className="ho-import-quote" key={`${entry.sourceId}-${index}`}><span>원문{index + 1}</span>{entry.quote}</blockquote>)}</details>}
            <div className="ho-draft-card-actions">
              {isAdopted && <span className="ho-draft-done" role="status">✓ 추가됨</span>}
              <button type="button" onClick={() => void adopt(item, group.unitTitle)} disabled={busy}>{adopting === item.id ? '추가하는 중…' : isAdopted ? '이 항목 다시 추가' : '이 항목 채택'}</button>
            </div>
          </article>;
        })}</div>
      </section>)}</div>
    </>}
  </Modal>;
}
