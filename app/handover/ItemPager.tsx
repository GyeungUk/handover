'use client';

import { useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { HandoverCategory } from '../handover-schema';
import { categories } from './categories';

type CategorizedItem = { id: string; category: HandoverCategory };
type Selection = { id: string; index: number };
type ReadingOffset = { id: string; offset: number };

/** Remember each section's reading position by identity, including after edits and removals. */
export function useCategoryPager<T extends CategorizedItem>(items: T[]) {
  const [category, setCategory] = useState<HandoverCategory | null>(null);
  const [positions, setPositions] = useState<Partial<Record<HandoverCategory, Selection>>>({});
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const readingOffsets = useRef<Partial<Record<HandoverCategory, ReadingOffset>>>({});
  const activeCategory = category ?? categories.find((meta) => items.some((item) => item.category === meta.id))?.id ?? 'responsibility';
  const categoryItems = items.filter((item) => item.category === activeCategory);
  const position = positions[activeCategory];
  const foundIndex = position ? categoryItems.findIndex((item) => item.id === position.id) : -1;
  const activeIndex = foundIndex >= 0 ? foundIndex : Math.max(0, Math.min(position?.index ?? 0, categoryItems.length - 1));
  const itemIds = JSON.stringify(categoryItems.map((item) => item.id));

  // Scroll updates the selection without issuing another navigation request. In particular,
  // reading halfway through a long card must not snap its heading back to the top.
  const recordReadingPosition = useEffectEvent(() => {
    if (!viewport || !categoryItems.length) return;
    const cards = Array.from(viewport.querySelectorAll<HTMLElement>(':scope > [data-pager-item]'));
    const readingLine = viewport.scrollTop + Math.min(80, viewport.clientHeight * 0.2);
    let index = 0;
    for (let candidate = 1; candidate < cards.length; candidate += 1) {
      if (cards[candidate].offsetTop > readingLine) break;
      index = candidate;
    }
    const item = categoryItems[index];
    const card = cards[index];
    if (!item || !card) return;
    readingOffsets.current[activeCategory] = { id: item.id, offset: viewport.scrollTop - card.offsetTop };
    setPositions((current) => {
      const previous = current[activeCategory];
      return previous?.id === item.id && previous.index === index
        ? current
        : { ...current, [activeCategory]: { id: item.id, index } };
    });
  });

  const restoreReadingPosition = useEffectEvent(() => {
    if (!viewport) return;
    const item = categoryItems[activeIndex];
    const card = Array.from(viewport.querySelectorAll<HTMLElement>(':scope > [data-pager-item]'))
      .find((node) => node.dataset.pagerItem === item?.id);
    const saved = readingOffsets.current[activeCategory];
    const offset = saved?.id === item?.id ? saved?.offset ?? 0 : 0;
    // Only this sector moves; scrollIntoView would also scroll the dialog or whole page.
    viewport.scrollTo({ top: card ? card.offsetTop + offset : 0, behavior: 'instant' });
    const body = viewport.closest<HTMLElement>('.ui-modal-body');
    const browser = viewport.closest<HTMLElement>('.ho-focus-browser');
    // An empty category can collapse the dialog's outer scroll position. When returning to
    // populated results, reveal the reader again so its final item remains fully reachable.
    if (body && browser && (viewport.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom
      || browser.getBoundingClientRect().top < body.getBoundingClientRect().top)) {
      body.scrollTo({ top: body.scrollTop + browser.getBoundingClientRect().top - body.getBoundingClientRect().top, behavior: 'instant' });
    }
  });

  useLayoutEffect(() => {
    restoreReadingPosition();
  }, [viewport, activeCategory, itemIds, navigationVersion]);

  useLayoutEffect(() => {
    if (!viewport) return;
    const body = viewport.closest<HTMLElement>('.ui-modal-body');
    const browser = viewport.closest<HTMLElement>('.ho-focus-browser');
    const toolbar = browser?.querySelector<HTMLElement>('.ho-focus-toolbar');
    if (!body || !browser || !toolbar) return;
    const fitViewport = () => {
      // Keep the whole sector viewport above the dialog footer, including on a phone.
      // Otherwise its last card could be at the scroll limit while still hidden by the footer.
      const height = Math.max(160, Math.min(640, body.clientHeight - toolbar.offsetHeight - 24));
      viewport.style.setProperty('--ho-category-height', `${height}px`);
      restoreReadingPosition();
    };
    fitViewport();
    const observer = new ResizeObserver(fitViewport);
    observer.observe(body);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [viewport]);

  useEffect(() => {
    if (!viewport) return;
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        recordReadingPosition();
      });
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [viewport]);

  const selectItem = (item: CategorizedItem) => {
    const peers = items.filter((candidate) => candidate.category === item.category);
    setCategory(item.category);
    setPositions((current) => ({ ...current, [item.category]: { id: item.id, index: Math.max(0, peers.findIndex((candidate) => candidate.id === item.id)) } }));
    readingOffsets.current[item.category] = { id: item.id, offset: 0 };
    setNavigationVersion((current) => current + 1);
  };
  const reset = useCallback(() => {
    setCategory(null);
    setPositions({});
    readingOffsets.current = {};
    setNavigationVersion((current) => current + 1);
  }, []);

  return {
    activeCategory, categoryItems, activeIndex, activeItem: categoryItems[activeIndex],
    selectCategory: setCategory, selectItem, reset, setScrollViewport: setViewport,
  };
}

export function CategoryFilter({ items, activeCategory, onSelect, disabled = false }: {
  items: CategorizedItem[];
  activeCategory: HandoverCategory;
  onSelect: (category: HandoverCategory) => void;
  disabled?: boolean;
}) {
  return <nav className="ho-category-filter" aria-label="항목 분류">
    {categories.map((category) => <button
      key={category.id} type="button" aria-pressed={activeCategory === category.id}
      onClick={() => onSelect(category.id)} disabled={disabled}
      style={{ '--category': category.accent, '--category-soft': category.soft } as CSSProperties}
    ><i aria-hidden="true" /><span>{category.short}</span><b>{items.filter((item) => item.category === category.id).length}</b></button>)}
  </nav>;
}

export default function ItemPager({ items, activeIndex, onSelect, label, controls, disabled = false }: {
  items: { id: string; title: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  label: string;
  controls: string;
  disabled?: boolean;
}) {
  const statusId = useId();
  if (!items.length) return null;
  return <nav className="ho-item-pager" aria-label={`${label} 항목 이동`} onKeyDown={(event) => {
    // Native selects keep their own arrow-key behavior; text editors are outside this control.
    if (disabled || !(event.target instanceof HTMLButtonElement) || event.altKey || event.ctrlKey || event.metaKey) return;
    const next = event.key === 'ArrowLeft' ? activeIndex - 1 : event.key === 'ArrowRight' ? activeIndex + 1 : -1;
    if (next >= 0 && next < items.length) { event.preventDefault(); onSelect(next); }
  }}>
    <label className="ho-item-jump"><span>{label} <small>스크롤하거나 화살표로 이동</small></span>
      <select aria-label={`${label} 항목 바로 이동`} aria-controls={controls} value={items[activeIndex].id} disabled={disabled || items.length === 1} onChange={(event) => onSelect(items.findIndex((item) => item.id === event.target.value))}>
        {items.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title || '제목 없는 항목'}</option>)}
      </select>
    </label>
    <div className="ho-item-pager-controls">
      <button type="button" aria-label={`${label} 이전 항목`} aria-controls={controls} disabled={disabled || activeIndex === 0} onClick={() => onSelect(activeIndex - 1)}><span aria-hidden="true">‹</span> 이전</button>
      <span className="ho-item-position" aria-hidden="true"><b>{activeIndex + 1}</b><span>/</span>{items.length}</span>
      <button type="button" aria-label={`${label} 다음 항목`} aria-controls={controls} disabled={disabled || activeIndex === items.length - 1} onClick={() => onSelect(activeIndex + 1)}>다음 <span aria-hidden="true">›</span></button>
    </div>
    <span id={statusId} className="sr-only" role="status" aria-atomic="true">{label} {items.length}개 중 {activeIndex + 1}번째: {items[activeIndex].title}</span>
  </nav>;
}
