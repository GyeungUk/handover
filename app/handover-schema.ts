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
  /**
   * Why proposals were rejected before they became cards. A thin result then explains itself
   * instead of looking like the feature failed. Optional, so an older backend still parses.
   */
  skipped?: { reason: string; count: number }[];
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

/* ------------------------------------------------------------------ *
 * The saved document
 *
 * Everything above describes what the AI *proposes*. What follows is what the workspace actually
 * keeps: the entries the author adopted, the units they grouped them into, and where the document
 * stands in the review workflow. Both backends store exactly these fields.
 * ------------------------------------------------------------------ */

export type WorkflowStatus = 'draft' | 'pending' | 'rejected' | 'approved';
export type ReviewDecision = 'approved' | 'rejected';
/** `pending` belongs to an individual unit; the document status is only a queue summary. */
export type BundleState = 'pending' | ReviewDecision;

export const workflowStatuses: WorkflowStatus[] = ['draft', 'pending', 'rejected', 'approved'];

/** A document is editable only before it is submitted, or after it comes back rejected. */
export const isEditableStatus = (status: WorkflowStatus) => status === 'draft' || status === 'rejected';

/**
 * One attached file.
 *
 * `url` is a browser object URL and lives only as long as the tab — it is deliberately not stored.
 * An attachment loaded back from the database therefore arrives with an empty `url`, which the
 * workspace shows as "다시 첨부 필요" rather than as a broken download link.
 */
export type EntryAttachment = { id: string; name: string; size: number; type: string; url: string };

export type EntryFormatting = { fontFamily: string; fontSize: string };

export type HandoverEntry = {
  id: string;
  category: HandoverCategory;
  title: string;
  detail: string;
  properties: Record<string, string>;
  attachments: EntryAttachment[];
  formatting: EntryFormatting;
};

/**
 * A group of entries reviewed and approved as one unit.
 *
 * `decision` is null while drafting, `pending` while the reviewer has it, then the final verdict.
 * `comment` is the verdict standing on it now; `previousComment` is the rejection a resubmitted
 * unit is answering. Without the second field the reviewer would re-read a correction with no
 * record of what they asked for.
 * Both are set only by the server: a save never sends them.
 */
export type WorkBundle = {
  id: string;
  title: string;
  entryIds: string[];
  decision: BundleState | null;
  comment: string;
  previousComment: string;
};

export type HandoverDocument = {
  ownerName: string;
  status: WorkflowStatus;
  entries: HandoverEntry[];
  bundles: WorkBundle[];
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

/** One line of the part leader's submission list. Only a submitted document appears there. */
export type HandoverDocumentSummary = {
  ownerEmail: string;
  ownerName: string;
  status: WorkflowStatus;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

/**
 * One academic year on file.
 *
 * The live document is rewritten in place every year, so a year only survives because approving it
 * files a copy. An author sees their own years; the part leader sees the whole office's.
 */
export type HandoverArchiveSummary = {
  ownerEmail: string;
  ownerName: string;
  academicYear: number;
  /** e.g. "2026학년도" — formed by the server so the two backends label a year identically. */
  academicYearLabel: string;
  status: WorkflowStatus;
  entryCount: number;
  bundleCount: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  archivedAt: string;
};

/** {@code GET /api/handover/archives} */
export type HandoverArchiveListResponse = {
  archives: HandoverArchiveSummary[];
  viewerRole: 'admin' | 'member';
};

/** {@code GET /api/handover/archives/{academicYear}} — the document exactly as it was approved. */
export type HandoverArchiveResponse = {
  archive: HandoverArchiveSummary;
  document: HandoverDocument;
};

/** `null` means this account has never saved a document; the workspace then starts empty. */
export type HandoverDocumentResponse = { document: HandoverDocument | null };

/** One reviewer verdict, sent together for the whole document so a review lands atomically. */
export type BundleDecisionInput = { bundleId: string; decision: ReviewDecision; comment: string };

/** Size limits both backends enforce identically, so a document that saves on one saves on the other. */
export const documentLimits = {
  entries: 200,
  bundles: 50,
  entryTitle: 200,
  entryDetail: 20000,
  bundleTitle: 120,
  propertyValue: 200,
  comment: 1000,
  attachmentsPerEntry: 10,
  attachmentName: 260,
  attachmentBytes: 20 * 1024 * 1024,
} as const;
