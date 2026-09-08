'use client';

import { useState, type CSSProperties } from 'react';
import type { DraftItem, DraftResponse } from '../../handover-schema';
import { categories } from '../categories';
import { Button, Modal } from '../../ui';
import { useTeams } from '../../workspace/context';
import ItemPager, { CategoryFilter, useCategoryPager } from '../ItemPager';

/** Turns a person's calendar into proposed entries. Nothing is saved until the author adopts it. */
export default function DraftModal({ onAdopt, onClose }: { onAdopt: (item: DraftItem) => void | Promise<void>; onClose: () => void }) {
  /* The live org chart, not the shipped seed one: a person who signed up here is a real owner of
     real work, and one who was taken off the chart is not someone to draft a handover for. */
  const teams = useTeams();
  const [personId, setPersonId] = useState(teams.find((team) => team.people.length)?.people[0].id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DraftResponse | null>(null);
  const [adopted, setAdopted] = useState<string[]>([]);
  const [adopting, setAdopting] = useState('');
  const pager = useCategoryPager(result?.drafts ?? []);
  const { setScrollViewport } = pager;
  const activeMeta = categories.find((category) => category.id === pager.activeCategory)!;

  const generate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    pager.reset();
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

  const adopt = async (item: DraftItem) => {
    setAdopting(item.id);
    setError('');
    try {
      await onAdopt(item);
      setAdopted((current) => current.includes(item.id) ? current : [...current, item.id]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '초안을 항목으로 추가하지 못했습니다.');
    } finally {
      setAdopting('');
    }
  };

  const adoptAll = async () => {
    if (!result) return;
    setAdopting('all');
    setError('');
    try {
      for (const item of result.drafts.filter((item) => !adopted.includes(item.id))) await onAdopt(item);
      setAdopted(result.drafts.map((item) => item.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '초안을 항목으로 추가하지 못했습니다.');
    } finally {
      setAdopting('');
    }
  };

  const remaining = result ? result.drafts.filter((item) => !adopted.includes(item.id)).length : 0;

  return <Modal
    onClose={onClose}
    width="lg"
    className="ho-draft-modal"
    dismissable={!loading && !adopting}
    title="캘린더에서 상세 초안 만들기"
    description="담당자의 연간 일정과 변경 이력을 근거로 업무 개요·현황·인계 포인트까지 구분해 제안합니다. 채택한 초안도 남아 있어 같은 일정 기반 내용을 필요할 때마다 다시 항목으로 추가할 수 있습니다."
    footer={<>
      <p className="ho-modal-note"><span aria-hidden="true">ⓘ</span> 초안은 일정 기록만을 근거로 합니다. ‘확인이 필요한 내용’의 질문은 작성자가 직접 채워 주세요.</p>
      <span className="spacer" />
      <Button onClick={onClose} disabled={Boolean(adopting)}>닫기</Button>
      <Button variant="primary" onClick={() => void adoptAll()} disabled={!result || remaining === 0 || Boolean(adopting)}>{adopting === 'all' ? '추가하는 중…' : `남은 ${remaining}건 모두 채택`}</Button>
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
          <span>{result.drafts.length}건 제안 · {adopted.length}건 1회 이상 추가됨</span>
        </div>
        <div className="ho-focus-browser" style={{ '--category': activeMeta.accent, '--category-soft': activeMeta.soft } as CSSProperties}>
          <div className="ho-focus-toolbar">
            <CategoryFilter items={result.drafts} activeCategory={pager.activeCategory} onSelect={pager.selectCategory} disabled={Boolean(adopting)} />
            <ItemPager items={pager.categoryItems} activeIndex={pager.activeIndex} onSelect={(index) => pager.selectItem(pager.categoryItems[index])} label={activeMeta.short} controls="ho-draft-current" disabled={Boolean(adopting)} />
          </div>
        <div ref={setScrollViewport} id="ho-draft-current" className="ho-focus-content ho-category-scroll" role="region" aria-label={`${activeMeta.short} 초안 목록`} tabIndex={0}>{pager.categoryItems.map((item) => {
          const meta = categories.find((category) => category.id === item.category)!;
          const isAdopted = adopted.includes(item.id);
          return <article data-pager-item={item.id} className="ho-draft-card" key={item.id} style={{ '--category': meta.accent, '--category-soft': meta.soft } as CSSProperties}>
            <div className="ho-draft-card-head">
              <span className="ho-draft-chip"><i />{meta.short}</span>
              <span className={`ho-draft-basis ${item.basis}`}>{item.basis === 'record' ? '기록 기반' : '확인 필요'}</span>
              <small>근거 · {item.sourceTask}</small>
            </div>
            <h4>{item.title}</h4>
            {Object.keys(item.properties).length > 0 && <div className="ho-draft-properties">{meta.propertyFields.map((field) => item.properties[field.key] && <span key={field.key}><b>{field.label}</b>{item.properties[field.key]}</span>)}</div>}
            <div className="ho-draft-body" role="region" aria-label={`${item.title} 본문`} tabIndex={0} dangerouslySetInnerHTML={{ __html: item.detail }} />
            <div className="ho-draft-card-actions">
              {isAdopted && <span className="ho-draft-done">✓ 추가됨 · 다시 추가 가능</span>}
              <button type="button" onClick={() => void adopt(item)} disabled={Boolean(adopting)}>{adopting === item.id ? '추가하는 중…' : isAdopted ? '이 초안 다시 추가' : '이 초안 채택'}</button>
            </div>
          </article>;
        })}{!pager.activeItem && <div className="ho-focus-empty"><b>{activeMeta.short} 초안이 없습니다.</b><p>다른 분류를 선택해 제안된 내용을 확인하세요.</p></div>}</div>
        </div>
      </>}

  </Modal>;
}
