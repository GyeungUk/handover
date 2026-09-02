/**
 * The four sections a handover document is made of.
 *
 * Everything about a section that is not its content lives here — its accent,
 * its ground, the example the title field shows, and which property fields it
 * asks for. Adding a fifth section is an entry in this array.
 */
import { propertyFieldsByCategory, type EntryFormatting, type HandoverCategory, type HandoverEntry, type PropertyField, type WorkBundle } from '../handover-schema';

export type CategoryMeta = {
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

export const categories: CategoryMeta[] = [
  { id: 'responsibility', step: '01', label: '담당업무', short: '담당업무', description: '현재 맡고 있는 역할과 책임 범위를 기록합니다.', accent: '#1d5f92', soft: '#e5eef6', placeholder: '예: 외국인 유학생 체류·비자 관리', propertyFields: propertyFieldsByCategory.responsibility },
  { id: 'plan', step: '02', label: '주요업무계획 및 진행사항', short: '계획 및 진행', description: '예정된 일정과 현재까지의 진행 상황을 남깁니다.', accent: '#1f7a70', soft: '#e3f1ef', placeholder: '예: 2학기 체류기간 연장 단체접수', propertyFields: propertyFieldsByCategory.plan },
  { id: 'issue', step: '03', label: '현안사항 및 문제점', short: '현안 및 문제', description: '주의가 필요한 이슈와 대응 상황을 정리합니다.', accent: '#9a6a24', soft: '#f6efe1', placeholder: '예: 보완서류 제출 지연 학생 발생', propertyFields: propertyFieldsByCategory.issue },
  { id: 'pending', step: '04', label: '주요미결사항', short: '미결사항', description: '아직 완료되지 않아 후속 조치가 필요한 일을 적습니다.', accent: '#6a559b', soft: '#eeeaf7', placeholder: '예: 출입국 방문 일정 최종 확정 대기', propertyFields: propertyFieldsByCategory.pending },
];

export const defaultFormatting: EntryFormatting = { fontFamily: 'Pretendard', fontSize: '16' };

/**
 * The font-family to actually render an entry in.
 *
 * The picker stores a plain family name, and that name is what a saved entry carries — but the
 * Pretendard the rest of the interface uses is served as `Pretendard Variable`, so the bare name
 * matched nothing and every entry fell back to whatever face the reader's browser defaults to.
 * Expanding it here rather than at the picker keeps entries written before this fix rendering in
 * the same face as the ones written after it.
 */
export const fontStack = (family: string) =>
  family === 'Pretendard' ? '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif' : family;

export const initialEntries: HandoverEntry[] = [];
export const initialBundles: WorkBundle[] = [];

export const categoryOf = (id: HandoverCategory) => categories.find((category) => category.id === id)!;
