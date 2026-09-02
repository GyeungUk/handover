'use client';

import { useState, type CSSProperties } from 'react';
import type { DraftItem, DraftResponse } from '../../handover-schema';
import { categories } from '../categories';
import { Button, Modal } from '../../ui';
import { useTeams } from '../../workspace/context';

/** Turns a person's calendar into proposed entries. Nothing is saved until the author adopts it. */
export default function DraftModal({ onAdopt, onClose }: { onAdopt: (item: DraftItem) => void; onClose: () => void }) {
  /* The live org chart, not the shipped seed one: a person who signed up here is a real owner of
     real work, and one who was taken off the chart is not someone to draft a handover for. */
  const teams = useTeams();
  const [personId, setPersonId] = useState(teams.find((team) => team.people.length)?.people[0].id ?? '');
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

  return <Modal
    onClose={onClose}
    width="lg"
    className="ho-draft-modal"
    dismissable={!loading}
    title="캘린더에서 상세 초안 만들기"
    description="담당자의 연간 일정과 변경 이력을 근거로 업무 개요·현황·인계 포인트까지 구분해 제안합니다. 채택하기 전까지 저장되지 않습니다."
    footer={<>
      <p className="ho-modal-note"><span aria-hidden="true">ⓘ</span> 초안은 일정 기록만을 근거로 합니다. ‘확인이 필요한 내용’의 질문은 작성자가 직접 채워 주세요.</p>
      <span className="spacer" />
      <Button onClick={onClose}>닫기</Button>
      <Button variant="primary" onClick={adoptAll} disabled={!result || remaining === 0}>남은 {remaining}건 모두 채택</Button>
    </>}
  >
      <div className="ho-draft-controls">
        <label><span>담당자</span><select value={personId} onChange={(event) => setPersonId(event.target.value)} disabled={loading}>{teams.filter((team) => team.people.length).map((team) => <optgroup label={team.title} key={team.id}>{team.people.map((person) => <option value={person.id} key={person.id}>{person.name} · {person.role}</option>)}</optgroup>)}</select></label>
        <button type="button" onClick={generate} disabled={loading || !personId}>{loading ? '상세 초안 만드는 중…' : result ? '다시 만들기' : '상세 초안 만들기'}</button>
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
          return <article className={`ho-draft-card ${isAdopted ? 'is-adopted' : ''}`} key={item.id} style={{ '--category': meta.accent, '--category-soft': meta.soft } as CSSProperties}>
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

  </Modal>;
}
