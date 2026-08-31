'use client';

import { useEffect, useState } from 'react';
import type { Person, Task } from '../../org-data';

type ChecklistKey = 'result-report' | 'schedule-share' | 'contact-refresh';
type ChecklistState = {
  key: ChecklistKey;
  completed: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

const CHECKS: ReadonlyArray<{ key: ChecklistKey; label: string; description: string }> = [
  {
    key: 'result-report',
    label: '전년도 결과보고서 확인',
    description: '이전 운영 결과와 개선사항을 이번 업무에 반영합니다.',
  },
  {
    key: 'schedule-share',
    label: '관련 부서 일정 공유',
    description: '협업 부서가 시작일과 마감일을 알고 있는지 확인합니다.',
  },
  {
    key: 'contact-refresh',
    label: '담당자 연락망 최신화',
    description: '내부 담당자와 외부 기관 연락처를 최신 상태로 맞춥니다.',
  },
];

const blankItems = () => CHECKS.map(({ key }) => ({
  key,
  completed: false,
  updatedBy: null,
  updatedAt: null,
}));

function auditLabel(item: ChecklistState) {
  if (!item.updatedBy || !item.updatedAt) return null;
  const updated = new Date(item.updatedAt);
  const date = Number.isNaN(updated.getTime())
    ? ''
    : updated.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  return `${item.updatedBy}${date ? ` · ${date}` : ''}`;
}

/** The three task-level handover checks, loaded only while the detail is open. */
export default function TaskChecklist({ task, person }: { task: Task; person: Person }) {
  const [items, setItems] = useState<ChecklistState[]>(blankItems);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [pending, setPending] = useState<ChecklistKey[]>([]);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ personId: person.id, taskTitle: task.title });
    fetch(`/api/task-checklists?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { items?: ChecklistState[]; error?: string } | null;
        if (!response.ok || !payload?.items) {
          throw new Error(payload?.error ?? '준비사항을 불러오지 못했습니다.');
        }
        return payload.items;
      })
      .then(setItems)
      .catch((error) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          setLoadError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [person.id, retry, task.title]);

  const toggle = async (key: ChecklistKey, completed: boolean) => {
    const previous = items.find((item) => item.key === key);
    if (!previous || pending.includes(key)) return;
    setSaveError('');
    setPending((current) => [...current, key]);
    setItems((current) => current.map((item) => item.key === key ? { ...item, completed } : item));
    try {
      const response = await fetch('/api/task-checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: person.id, taskTitle: task.title, itemKey: key, completed }),
      });
      const payload = await response.json().catch(() => null) as { item?: ChecklistState; error?: string } | null;
      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error ?? '변경 내용을 저장하지 못했습니다.');
      }
      const saved = payload.item;
      setItems((current) => current.map((item) => item.key === key ? saved : item));
    } catch (error) {
      setItems((current) => current.map((item) => item.key === key ? previous : item));
      setSaveError(error instanceof Error ? error.message : '변경 내용을 저장하지 못했습니다.');
    } finally {
      setPending((current) => current.filter((itemKey) => itemKey !== key));
    }
  };

  const completedCount = items.filter((item) => item.completed).length;
  const percent = Math.round((completedCount / CHECKS.length) * 100);

  return (
    <section className="task-checklist" aria-labelledby="task-checklist-title" aria-busy={loading}>
      <header className="task-checklist-head">
        <div>
          <span>인수인계 준비</span>
          <h3 id="task-checklist-title">업무 시작 전 확인</h3>
        </div>
        <strong aria-label={`${CHECKS.length}개 중 ${completedCount}개 완료`}>
          <b>{completedCount}</b> / {CHECKS.length}
        </strong>
      </header>

      <div className="task-checklist-progress" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </div>

      {loading ? (
        <div className="task-checklist-skeleton" aria-label="준비사항을 불러오는 중">
          {CHECKS.map(({ key }) => <i key={key} />)}
        </div>
      ) : loadError ? (
        <div className="task-checklist-error" role="alert">
          <span className="mark" aria-hidden="true">!</span>
          <div>
            <b>준비사항을 불러오지 못했습니다</b>
            <small>{loadError}</small>
          </div>
          <button type="button" onClick={() => {
            setLoading(true);
            setLoadError('');
            setSaveError('');
            setRetry((current) => current + 1);
          }}>다시 시도</button>
        </div>
      ) : (
        <div className="task-checklist-items">
          {CHECKS.map((definition) => {
            const item = items.find((candidate) => candidate.key === definition.key) ?? {
              key: definition.key,
              completed: false,
              updatedBy: null,
              updatedAt: null,
            };
            const isPending = pending.includes(definition.key);
            const audit = auditLabel(item);
            return (
              <label className={item.completed ? 'is-complete' : ''} key={definition.key}>
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={(event) => toggle(definition.key, event.target.checked)}
                  disabled={isPending}
                />
                <span>
                  <b>{definition.label}</b>
                  <small>{definition.description}</small>
                </span>
                <em>{isPending ? '저장 중…' : audit ?? '미완료'}</em>
              </label>
            );
          })}
        </div>
      )}

      {saveError && <p className="task-checklist-save-error" role="alert">{saveError}</p>}
      {!loading && !loadError && (
        <p className="task-checklist-status" role="status" aria-live="polite">
          {completedCount === CHECKS.length
            ? '모든 준비사항을 확인했습니다.'
            : `남은 준비사항 ${CHECKS.length - completedCount}개 · 체크하면 바로 저장됩니다.`}
        </p>
      )}
    </section>
  );
}
