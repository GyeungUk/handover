'use client';

import { useState, type CSSProperties } from 'react';
import { annualActionLabels, type AnnualAction, type AnnualItem, type AnnualResponse, type HandoverEntry } from '../../handover-schema';
import { categories } from '../categories';
import { plainText } from '../format';
import { Button, Modal } from '../../ui';

export default function AnnualModal({ entries, startsNewCycle, onApply, onClose }: { entries: HandoverEntry[]; startsNewCycle: boolean; onApply: (item: AnnualItem) => Promise<void>; onClose: () => void }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnnualResponse | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [applying, setApplying] = useState('');

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

  const apply = async (item: AnnualItem) => {
    setApplying(item.id);
    setError('');
    try {
      await onApply(item);
      setApplied((current) => [...current, item.id]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '수정 내용을 반영하지 못했습니다.');
    } finally {
      setApplying('');
    }
  };

  const actionable = result ? result.items.filter((item) => item.action !== 'keep') : [];
  const remaining = actionable.filter((item) => !applied.includes(item.id));

  const applyAll = async () => {
    setApplying('all');
    setError('');
    try {
      for (const item of remaining) await onApply(item);
      setApplied(actionable.map((item) => item.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '수정 내용을 반영하지 못했습니다.');
    } finally {
      setApplying('');
    }
  };

  const countOf = (action: AnnualAction) => result?.items.filter((item) => item.action === action).length ?? 0;

  return <Modal
    onClose={onClose}
    width="lg"
    className="ho-draft-modal"
    dismissable={!loading && !applying}
    title="다음 학년도 상세 초안"
    description="지난 학년도 인수인계서의 업무 범위·절차·인계 포인트를 보존하면서, 해마다 달라지는 날짜·상태·담당 정보를 구분해 제안합니다."
    footer={<>
      <p className="ho-modal-note"><span aria-hidden="true">ⓘ</span> 날짜를 한 해 뒤로 옮긴 항목은 실제 학사일정과 다를 수 있어 확인 질문이 함께 붙습니다.</p>
      <span className="spacer" />
      <Button onClick={onClose} disabled={Boolean(applying)}>닫기</Button>
      <Button variant="primary" onClick={() => void applyAll()} disabled={!result || remaining.length === 0 || Boolean(applying)}>
        {applying === 'all' ? '반영하는 중…' : `남은 ${remaining.length}건 모두 반영`}
      </Button>
    </>}
  >
      <div className="ho-draft-controls">
        <label><span>기준 학년도</span><select value={year} onChange={(event) => { setYear(Number(event.target.value)); setResult(null); setApplied([]); }} disabled={loading}>{[thisYear - 1, thisYear, thisYear + 1].map((option) => <option value={option} key={option}>{option}학년도 → {option + 1}학년도</option>)}</select></label>
        <button type="button" onClick={generate} disabled={loading || !entries.length}>{loading ? '상세 초안 만드는 중…' : result ? '다시 만들기' : '상세 초안 만들기'}</button>
      </div>

      {!entries.length && <p className="ho-annual-empty">업데이트할 기존 항목이 없습니다. 먼저 기존 자료를 올리거나 인수인계 항목을 작성해 주세요.</p>}
      {startsNewCycle && <p className="ho-annual-empty">승인된 문서입니다. 첫 수정을 반영하는 시점에 검토 정보를 정리하고 다음 학년도 작성 상태로 전환합니다.</p>}

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
          return <article className={`ho-draft-card ho-annual-card ${item.action} ${isApplied ? 'is-adopted' : ''}`} key={item.id} style={{ '--category': meta.accent, '--category-soft': meta.soft } as CSSProperties}>
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
                  : <button type="button" onClick={() => void apply(item)} disabled={Boolean(applying)}>{applying === item.id ? '반영하는 중…' : item.action === 'archive' ? '올해 문서에서 제외' : item.action === 'new' ? '항목으로 추가' : '수정 내용 반영'}</button>}
            </div>
          </article>;
        })}</div>
      </>}

  </Modal>;
}
