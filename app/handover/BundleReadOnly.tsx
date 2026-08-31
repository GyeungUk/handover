'use client';

import type { CSSProperties } from 'react';
import type { HandoverEntry, WorkBundle } from '../handover-schema';
import { categories } from './categories';
import { fileKind, formatBytes } from './format';

export default function BundleReadOnly({ bundle, entries, onOpenEntry }: { bundle: WorkBundle; entries: HandoverEntry[]; onOpenEntry: (entryId: string) => void }) {
  return <div className="ho-read-bundle">
    <div className="ho-read-bundle-head"><span>{String(bundle.title).slice(0, 1)}</span><div><small>업무 단위</small><h3>{bundle.title}</h3></div><b>{bundle.entryIds.length}개 항목</b></div>
    <div className="ho-read-columns">{categories.map((category) => {
      const items = entries.filter((entry) => entry.category === category.id && bundle.entryIds.includes(entry.id));
      return <div key={category.id} style={{ '--category': category.accent } as CSSProperties}><span><i />{category.short}<em>{items.length}</em></span>{items.length ? items.map((item) => <article key={item.id}><b>{item.title}</b><div className="ho-read-properties">{category.propertyFields.map((field) => item.properties[field.key] && <span key={field.key}>{field.label} · {item.properties[field.key]}</span>)}</div><div className="ho-rich-read" style={{ fontFamily: item.formatting.fontFamily, fontSize: `${item.formatting.fontSize}px` }} dangerouslySetInnerHTML={{ __html: item.detail }} />{item.attachments.length > 0 && <div className="ho-read-files">{item.attachments.map((file) => {
      const inner = <><i>{fileKind(file.name)}</i><b>{file.name}</b><em>{formatBytes(file.size)}</em></>;
      return file.url
        ? <a key={file.id} href={file.url} download={file.name} target="_blank" rel="noreferrer">{inner}</a>
        : <span key={file.id} className="unavailable" title="이 파일은 다시 첨부해야 합니다.">{inner}</span>;
    })}</div>}<button type="button" className="ho-read-open" onClick={() => onOpenEntry(item.id)}>자세히 보기 <span aria-hidden="true">→</span></button></article>) : <p className="ho-no-item">연결된 항목 없음</p>}</div>;
    })}</div>
  </div>;
}
