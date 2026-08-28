/** Handover document schema shared by the client workspace and the draft API route. */

export type HandoverCategory = 'responsibility' | 'plan' | 'issue' | 'pending';
export type PropertyField = { key: string; label: string; placeholder: string; options?: string[] };

export const handoverCategories: HandoverCategory[] = ['responsibility', 'plan', 'issue', 'pending'];

export const handoverCategoryLabels: Record<HandoverCategory, string> = {
  responsibility: '담당업무',
  plan: '주요업무계획 및 진행사항',
  issue: '현안사항 및 문제점',
  pending: '주요미결사항',
};

export const propertyFieldsByCategory: Record<HandoverCategory, PropertyField[]> = {
  responsibility: [
    { key: 'cycle', label: '업무 주기', placeholder: '선택', options: ['수시', '매일', '매주', '매월', '학기별', '연 1회'] },
    { key: 'department', label: '협업 부서', placeholder: '예: 학사지원팀' },
    { key: 'importance', label: '중요도', placeholder: '선택', options: ['일반', '중요', '핵심'] },
  ],
  plan: [
    { key: 'due', label: '목표 일정', placeholder: '예: 2026. 09. 06' },
    { key: 'progress', label: '진행률', placeholder: '선택', options: ['준비 전', '25%', '50%', '75%', '완료'] },
    { key: 'next', label: '다음 담당', placeholder: '예: 박민서 주임' },
  ],
  issue: [
    { key: 'impact', label: '영향도', placeholder: '선택', options: ['낮음', '보통', '높음', '긴급'] },
    { key: 'response', label: '대응 상태', placeholder: '선택', options: ['확인 중', '대응 중', '협의 중', '해결'] },
    { key: 'department', label: '관련 부서', placeholder: '예: 출입국관리사무소' },
  ],
  pending: [
    { key: 'due', label: '완료 예정일', placeholder: '예: 2026. 09. 02' },
    { key: 'priority', label: '우선순위', placeholder: '선택', options: ['낮음', '보통', '높음', '긴급'] },
    { key: 'owner', label: '후속 담당', placeholder: '예: 김지현' },
  ],
};

/**
 * How much of a draft item rests on recorded fact.
 * `record` — every statement traces back to the calendar or a logged reschedule.
 * `inferred` — derived from date arithmetic, so the author must confirm it.
 */
export type DraftBasis = 'record' | 'inferred';

/** One proposed handover entry. `detail` is HTML the server built from escaped model text. */
export type DraftItem = {
  id: string;
  category: HandoverCategory;
  title: string;
  detail: string;
  properties: Record<string, string>;
  basis: DraftBasis;
  questions: string[];
  sourceTask: string;
};

export type DraftResponse = {
  person: { id: string; name: string; role: string; team: string };
  todayLabel: string;
  drafts: DraftItem[];
};

/** How much a gap hurts the successor. `high` blocks the work, `low` is worth tightening. */
export type FindingSeverity = 'high' | 'low';

export const findingKinds = ['지시대명사', '연락처', '일정', '근거', '범위'] as const;
export type FindingKind = (typeof findingKinds)[number];

/** One gap found in an entry. `quote` is verified to appear in that entry before it is returned. */
export type QualityFinding = {
  id: string;
  entryId: string;
  kind: FindingKind;
  severity: FindingSeverity;
  quote: string;
  message: string;
  suggestion: string;
};

export type QualityResponse = { checked: number; findings: QualityFinding[] };

/**
 * One entry proposed from an uploaded document.
 * `sourceQuote` is verified to appear in the uploaded text before it is returned; when the model
 * paraphrased instead of quoting, it comes back empty and the card shows no evidence line.
 */
export type ImportItem = {
  id: string;
  category: HandoverCategory;
  title: string;
  detail: string;
  properties: Record<string, string>;
  questions: string[];
  sourceQuote: string;
  /** `high` — the source clearly belongs in this section. `low` — the section was a judgement call. */
  confidence: 'high' | 'low';
};

export type ImportResponse = {
  fileName: string;
  charCount: number;
  items: ImportItem[];
  /** content the model could not place in any of the four sections, kept visible rather than dropped */
  unmapped: string[];
};

/** What next year's document should do with a current entry. */
export type AnnualAction = 'keep' | 'revise' | 'new' | 'archive';

export const annualActionLabels: Record<AnnualAction, string> = {
  keep: '그대로 유지',
  revise: '내용 수정',
  new: '신규 추가',
  archive: '올해는 제외',
};

export type AnnualItem = {
  id: string;
  action: AnnualAction;
  /** the entry this proposal acts on; null for `new` */
  entryId: string | null;
  previousTitle: string;
  category: HandoverCategory;
  title: string;
  detail: string;
  properties: Record<string, string>;
  reason: string;
  questions: string[];
};

export type AnnualResponse = {
  fromYear: number;
  toYear: number;
  reviewed: number;
  items: AnnualItem[];
};
