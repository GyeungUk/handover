/**
 * Runs one model-backed route against the real model, the way its Spring service builds the call.
 *
 * A prompt cannot be judged by reading it. Every rule now in `ai/prompt/*.txt` that is there
 * because of a measurement — the section tiebreaker, the copy threshold, the open-question split —
 * came from running a real document through this and counting what came back. Run it again before
 * and after a prompt change rather than guessing.
 *
 * It costs a real API call and is never part of the build. `AiResourcesTest` still covers that the
 * prompts and schemas load; this covers whether they work.
 *
 * Usage, from the repository root:
 *   node backend/tools/try-prompt.mjs import  <파일>          # pdf, docx, hwp, xlsx, txt, md
 *   node backend/tools/try-prompt.mjs quality <항목 JSON>
 *   node backend/tools/try-prompt.mjs annual  <항목 JSON> [지난학년도]
 *   node backend/tools/try-prompt.mjs draft   <personId> [오늘주차]
 *   node backend/tools/try-prompt.mjs calendar-check <personId>
 *
 * The entry JSON for quality and annual is a list of
 *   [{ "id": "e1", "category": "plan", "title": "…", "text": "…" }]
 * which is what the workspace posts. `--json` prints the raw answer instead of the report.
 * `--prompt=/path/import.txt` and `--schema=/path/import.json` compare saved resource revisions.
 *
 * The key comes from OPENAI_API_KEY, or from OPENAI_API_KEY in `.dev.vars` as run-local.sh reads
 * it. Node validates TLS against its own bundled roots; behind a proxy that rewrites certificates
 * that fails where curl succeeds, so `--curl` sends the request through curl instead.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODEL = 'gpt-5.6-luna';
const REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT ?? 'medium';
const SCHEMA_NAMES = {
  import: 'handover_import',
  quality: 'handover_quality',
  annual: 'handover_annual',
  draft: 'handover_draft',
  'calendar-check': 'calendar_alignment',
};

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')));
const [route, subject, extra] = args;
if (!SCHEMA_NAMES[route]) {
  console.error(`routes: ${Object.keys(SCHEMA_NAMES).join(', ')}`);
  process.exit(1);
}

const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const domain = readJson('backend/src/main/resources/domain/handover-schema.json');
const org = readJson('backend/src/main/resources/domain/org-data.json');
const calendar = readJson('backend/src/main/resources/domain/academic-calendar.json');

/* --- the prompt and the schema the route sends, with the enum markers resolved --- */
/* Optional snapshots let the same fixtures compare two prompt revisions without editing resources. */
const option = (name) => [...flags].find((flag) => flag.startsWith(`--${name}=`))?.slice(name.length + 3);
const system = read(option('prompt') ?? `backend/src/main/resources/ai/prompt/${route}.txt`);
const schema = readJson(option('schema') ?? `backend/src/main/resources/ai/schema/${route}.json`);
const enumSources = {
  categories: domain.categories,
  findingKinds: domain.findingKinds,
  annualActions: Object.keys(domain.annualActionLabels),
  alignmentActions: Object.keys(calendar.alignmentActionLabels),
};
(function resolveEnums(node) {
  if (!node || typeof node !== 'object') return;
  if (node.$enumFrom) {
    const values = enumSources[node.$enumFrom];
    if (!values) throw new Error(`unknown enum source: ${node.$enumFrom}`);
    delete node.$enumFrom;
    node.enum = values;
  }
  Object.values(node).forEach(resolveEnums);
})(schema);

const allowedProperties = (include = () => true) => Object.fromEntries(domain.categories.map((category) => [
  category,
  domain.propertyFieldsByCategory[category].filter((field) => include(field.key)).map((field) => ({
    key: field.key,
    설명: field.label,
    ...(field.options ? { 선택지: field.options } : { 예시: field.placeholder }),
  })),
]));

const normalize = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
const weekLabel = (week) => `${org.months[Math.floor(week / 4)]} ${(week % 4) + 1}주`;
const periodLabel = (task) => `${weekLabel(task.start)} ~ ${weekLabel(task.start + task.duration - 1)}`;

function findPerson(id) {
  for (const team of org.teams) {
    const person = team.people.find((candidate) => candidate.id === id);
    if (person) return { team, person };
  }
  throw new Error(`no such person: ${id}. try one of ${org.teams.flatMap((t) => t.people.map((p) => p.id)).join(', ')}`);
}

/** The entry body and the author's open questions, split the way AiSupport does. */
function splitOpenQuestions(text) {
  const body = normalize(text);
  const heading = body.lastIndexOf('확인이 필요한 내용');
  if (heading < 0) return { body, openQuestions: '' };
  return { body: body.slice(0, heading).trim(), openQuestions: body.slice(heading + 9).trim() };
}

/** Text out of a real file, through the same converters and tidier the browser uses. */
async function extractFile(path) {
  const bytes = new Uint8Array(readFileSync(path));
  const converter = /\.pdf$/i.test(path) ? '@mdgate/pdf'
    : /\.docx$/i.test(path) ? '@mdgate/docx'
      : /\.hwpx?$/i.test(path) ? '@mdgate/hwp'
        : /\.xlsx?m?$/i.test(path) ? '@mdgate/xlsx' : null;
  const raw = converter ? await (await import(converter)).toMarkdown(bytes) : readFileSync(path, 'utf8');
  /* The tidier lives in the Next app as TypeScript; take the one function rather than a build step. */
  const source = read('app/file-text.ts');
  const start = source.indexOf('export function tidyExtractedText');
  const tidier = source.slice(start).split('\nexport async function')[0].replace(/value: string/g, 'value');
  const { tidyExtractedText } = await import(`data:text/javascript,${encodeURIComponent(tidier)}`);
  return tidyExtractedText(raw);
}

/* ImportService#chunk and #userMessage, so a measurement here is a measurement of the route. */
const CHUNK_TARGET = 9000;
const MAX_CHUNKS = 8;
const CHUNK_OVERLAP = 300;

function chunkSource(source) {
  const target = Math.max(CHUNK_TARGET, Math.ceil(source.length / MAX_CHUNKS));
  /* A repeated header may put blank lines inside one converted table; it is still one work unit. */
  if (source.length <= target || (source.length <= TABLE_CEILING && isTable(source))) return [source];
  const chunks = [];
  let current = '';
  for (const piece of sourcePieces(source, target)) {
    /* Half a part is the floor, so a heading is never left alone away from what it introduces. */
    if (current.length >= target / 2 && current.length + piece.length > target) { chunks.push(current.trim()); current = ''; }
    current += `${piece}\n\n`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [source];
}

const TABLE_CEILING = 4 * CHUNK_TARGET;

/** Whether most of the block's lines are the pipe-delimited rows a converter writes. */
function isTable(block) {
  const lines = block.split('\n').filter((line) => line.trim());
  const rows = lines.filter((line) => line.trim().startsWith('|') && line.trim().endsWith('|')).length;
  return rows * 2 > lines.length;
}

/** Paragraphs, then the lines of an oversized paragraph, then a straight cut for an oversized line. */
function sourcePieces(source, target) {
  const pieces = [];
  for (const block of source.split(/\n\s*\n/)) {
    if (!block.trim()) continue;
    /* A table stays whole: its rows are one work unit, so cutting it repeats that unit per part. */
    if (block.length <= target || (block.length <= TABLE_CEILING && isTable(block))) {
      pieces.push(block.trim());
      continue;
    }
    for (const line of block.split('\n')) {
      if (!line.trim()) continue;
      for (let at = 0; at < line.length; at += target) pieces.push(line.slice(at, at + target).trim());
    }
  }
  return pieces;
}

const MAX_SEGMENTS = 150;
const SEPARATOR_ROW = /^\|[\s|:-]*\|$/;

/** ImportService#segments: paragraph blocks, and a schedule's rows one at a time. */
function sourceSegments(chunks) {
  let next = 1;
  return chunks.map((chunk) => {
    const units = [];
    for (const block of chunk.split(/\n\s*\n/)) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      if (!isTable(trimmed)) { units.push(trimmed); continue; }
      for (const line of trimmed.split('\n')) {
        const row = line.trim();
        if (row && !SEPARATOR_ROW.test(row)) units.push(row);
      }
    }
    const capped = [];
    const perUnit = Math.ceil(units.length / MAX_SEGMENTS);
    if (units.length > MAX_SEGMENTS) {
      for (let at = 0; at < units.length; at += perUnit) capped.push(units.slice(at, at + perUnit).join('\n'));
    } else capped.push(...units);
    return capped.map((text) => ({ id: `s${next++}`, text }));
  });
}

function importMessage(fileName, chunks, segments, part) {
  const safeImportProperties = new Set(['cycle', 'department', 'due', 'progress', 'response', 'owner', 'next']);
  const allowed = JSON.stringify(allowedProperties((key) => safeImportProperties.has(key)));
  const body = segments[part].map((segment) => `<조각 id="${segment.id}">\n${segment.text}\n</조각>\n`).join('');
  if (chunks.length === 1) return `섹션별 허용속성: ${allowed}\n\n<원문 파일="${fileName}">\n${body}</원문>`;
  const previous = part === 0 ? '' : chunks[part - 1];
  const tail = previous.length <= CHUNK_OVERLAP ? previous : previous.slice(-CHUNK_OVERLAP);
  return `섹션별 허용속성: ${allowed}\n\n`
    + `이 원문은 한 문서를 나눈 ${chunks.length}개 부분 중 ${part + 1}번째다. 이 부분에 있는 업무만 정리한다. `
    + '<앞부분끝>은 문장이 잘리지 않도록 붙인 직전 부분의 꼬리이므로, 그 안에서만 근거를 찾은 항목은 만들지 않는다.\n\n'
    + `${tail ? `<앞부분끝>\n${tail}\n</앞부분끝>\n\n` : ''}`
    + `<원문 파일="${fileName}" 부분="${part + 1}/${chunks.length}">\n${body}</원문>`;
}

async function buildUser() {
  if (route === 'import') {
    const source = await extractFile(subject);
    const chunks = chunkSource(source);
    const segments = sourceSegments(chunks);
    return {
      source,
      segments: segments.flat(),
      users: chunks.map((_, part) => importMessage(subject.split('/').pop(), chunks, segments, part)),
    };
  }

  if (route === 'quality') {
    const entries = readJson(subject).map((entry) => ({ ...entry, ...splitOpenQuestions(entry.text) }));
    return {
      user: entries.map((entry) => `<문서 id="${entry.id}" 섹션="${domain.categoryLabels[entry.category] ?? '기타'}">\n`
        + `제목: ${entry.title}\n본문: ${entry.body}\n`
        + `${entry.openQuestions ? `작성자확인요청: ${entry.openQuestions}\n` : ''}</문서>`).join('\n\n'),
    };
  }

  if (route === 'annual') {
    const fromYear = Number(extra ?? new Date().getFullYear());
    const entries = readJson(subject).map((entry) => ({ ...entry, ...splitOpenQuestions(entry.text) }));
    return {
      user: [
        `지난 학년도: ${fromYear}학년도 / 갱신 대상: ${fromYear + 1}학년도`,
        `섹션별 허용속성: ${JSON.stringify(allowedProperties())}`,
        '',
        ...entries.map((entry) => [
          `<항목 id="${entry.id}" 섹션="${domain.categoryLabels[entry.category]}">`,
          `제목: ${entry.title}`,
          `속성: ${JSON.stringify(entry.properties ?? {})}`,
          `본문: ${entry.body}`,
          ...(entry.openQuestions ? [`작성자확인요청: ${entry.openQuestions}`] : []),
          '</항목>',
        ].join('\n')),
      ].join('\n'),
    };
  }

  if (route === 'draft') {
    const { team, person } = findPerson(subject);
    const todayWeek = Number(extra ?? 26);
    const inferable = new Set(['importance', 'impact', 'priority']);
    const facts = person.tasks.map((task) => {
      const phase = task.start + task.duration <= todayWeek ? '완료'
        : task.start <= todayWeek ? '진행 중' : '예정';
      const fact = { 업무: task.title, 설명: task.note, 기간: periodLabel(task), 진행상태: phase };
      if (phase === '진행 중') {
        fact.경과 = `${task.duration}주 중 ${todayWeek - task.start + 1}주차`;
        fact.인계시점이후종료 = true;
      }
      return fact;
    });
    return {
      user: JSON.stringify({
        담당자: { 이름: person.name, 역할: person.role, 소속파트: team.title },
        오늘: weekLabel(todayWeek),
        허용속성: allowedProperties((key) => inferable.has(key)),
        필수출력개수: {
          responsibility: 1,
          plan: facts.filter((fact) => fact.진행상태 !== '완료').length,
          issue: facts.filter((fact) => fact.일정변경).length,
          pending: facts.filter((fact) => fact.인계시점이후종료).length,
        },
        업무목록: facts,
      }, null, 2),
    };
  }

  const { team, person } = findPerson(subject);
  const [from, to] = calendar.years;
  const shiftLabel = (weeks) => (weeks === 0 ? '변동 없음' : weeks > 0 ? `${weeks}주 늦춰짐` : `${-weeks}주 당겨짐`);
  const shifts = from.events.map((event) => {
    const next = to.events.find((candidate) => candidate.name === event.name) ?? event;
    return `- ${event.name} · ${weekLabel(event.week)} → ${weekLabel(next.week)} · ${shiftLabel(next.week - event.week)}`;
  });
  return {
    user: [
      `담당자: ${person.name} (${team.title} · ${person.role})`,
      `학사일정 비교: ${from.year}학년도 → ${to.year}학년도`, '', '학사일정 비교표:', ...shifts, '', '업무 목록:',
      ...person.tasks.map((task) => `<업무 제목="${task.title}">\n현재 기간: ${periodLabel(task)} (${task.duration}주)\n내용: ${task.note}\n</업무>`),
    ].join('\n'),
  };
}

function apiKey() {
  if (process.env.OPENAI_API_KEY?.trim()) return process.env.OPENAI_API_KEY.trim();
  try {
    const found = /^OPENAI_API_KEY=(.*)$/m.exec(read('.dev.vars'))?.[1]?.trim();
    if (found) return found;
  } catch { /* no .dev.vars, fall through to the error below */ }
  throw new Error('set OPENAI_API_KEY, or put it in .dev.vars as run-local.sh expects');
}

let callCount = 0;

async function ask(user) {
  const from = Date.now();
  const answer = await send(user);
  /* Per-call timing next to the wall clock: together they say whether the parts really overlapped. */
  console.error(`  · 호출 ${((Date.now() - from) / 1000).toFixed(0)}초`);
  return answer;
}

async function send(user) {
  const body = JSON.stringify({
    model: MODEL,
    ...(REASONING_EFFORT ? { reasoning_effort: REASONING_EFFORT } : {}),
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_schema', json_schema: { name: SCHEMA_NAMES[route], strict: true, schema } },
  });
  const url = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1/chat/completions';

  if (flags.has('--curl')) {
    /* The key goes in a 0600 config, never in argv where the process table would show it. */
    /* Concurrent parts each need their own pair, or one call's cleanup deletes another's body. */
    const stem = `${process.env.TMPDIR ?? '/tmp'}/try-prompt-${process.pid}-${callCount += 1}`;
    const configFile = `${stem}.conf`;
    const bodyFile = `${stem}.json`;
    writeFileSync(configFile, `header = "Authorization: Bearer ${apiKey()}"\n`, { mode: 0o600 });
    writeFileSync(bodyFile, body, { mode: 0o600 });
    try {
      /* Not the sync call: the parts of one document are asked for together, as the service asks. */
      const { stdout } = await promisify(execFile)('curl', [
        '-sS', '--max-time', '900', '--config', configFile,
        '-H', 'Content-Type: application/json', '--data-binary', `@${bodyFile}`, url,
      ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return JSON.parse(stdout);
    } finally {
      rmSync(configFile, { force: true });
      rmSync(bodyFile, { force: true });
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body,
  }).catch((failure) => {
    if (String(failure?.cause?.code ?? '').includes('CERT')) {
      throw new Error('TLS verification failed. Behind a proxy that rewrites certificates, re-run with --curl.');
    }
    throw failure;
  });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 400)}`);
  return response.json();
}

/**
 * What ImportService would keep. The two grounding checks are satisfied by a paste of the source,
 * so the markup and copied-run checks decide as much as they do; showing all four together is the
 * point of running this at all.
 */
function importVerdicts(items, source) {
  const haystack = normalize(source);
  /* Digit runs, as AiSupport#usesOnlyRecordedNumbers compares them. */
  const numbers = (value) => (value.match(/\d+/g) ?? []).map((run) => run.replace(/^0+(?=\d)/, ''));
  const recorded = new Set(numbers(haystack));
  const markup = /(?:^|\s)#{1,6}(?:\s|$)|\*\*|[►▶]/m;
  const copied = (candidate) => {
    const text = normalize(candidate);
    if (text.length < 90) return false;
    for (let start = 0; start + 90 <= text.length; start += 16) {
      if (haystack.includes(text.slice(start, start + 90))) return true;
    }
    return haystack.includes(text.slice(-90));
  };

  /* AiSupport#groundedQuote: exact first, then ignoring the spaces the model may have moved. */
  const quoteMatch = (candidate, ignored) => {
    const squeezedCandidate = [...candidate].filter((character) => !ignored.has(character)).join('');
    const origin = [];
    const squeezedSource = [...haystack].filter((character, index) => {
      if (ignored.has(character)) return false;
      origin.push(index);
      return true;
    }).join('');
    const at = squeezedSource.indexOf(squeezedCandidate);
    return at < 0 ? '' : haystack.slice(origin[at], origin[at + squeezedCandidate.length - 1] + 1);
  };
  const grounded = (candidate) => {
    const needle = normalize(candidate);
    if (!needle) return '';
    if (haystack.includes(needle)) return needle;
    const spacing = quoteMatch(needle, new Set([' ']));
    if (spacing) return spacing;
    return quoteMatch(needle, new Set([...` ()[]{}<>/\\|:·・※★*#`]));
  };

  /* AiSupport#titleOverlap and #SAME_WORK. */
  const bigrams = (value) => {
    const text = (value ?? '').replace(/\s+/g, '');
    const grams = new Set();
    for (let at = 0; at + 2 <= text.length; at += 1) grams.add(text.slice(at, at + 2));
    return grams;
  };
  const titleOverlap = (left, right) => {
    const first = bigrams(left);
    const second = bigrams(right);
    if (!first.size || !second.size) return 0;
    const shared = [...first].filter((gram) => second.has(gram)).length;
    return shared / (first.size + second.size - shared);
  };

  const used = new Set();
  const titles = new Map();
  return items.map((item) => {
    const quote = grounded(item.sourceQuote);
    const sectionTitles = titles.get(item.category) ?? [];
    const steps = item.operation?.steps ?? [];
    /* ImportService#operationProse: an invented threshold lands in a control, never in prose. */
    const operationText = operationProse(item.operation);
    const prose = [item.title, ...(item.paragraphs ?? []),
      ...(item.properties ?? []).map((pair) => pair.value), operationText].join(' ');
    let dropped = null;
    if (!(item.paragraphs ?? []).length && !operationText.trim()) dropped = '형식이 불완전한 항목';
    else if (!quote) dropped = '원문에서 근거 구절을 확인하지 못한 항목';
    else if (used.has(quote)) dropped = '같은 원문 구절을 다시 사용한 항목';
    else if (sectionTitles.some((seen) => titleOverlap(seen, item.title) >= 0.6)) dropped = '같은 업무를 다시 제안한 항목';
    else if (!numbers(prose).every((token) => recorded.has(token))) dropped = '원문에 없는 숫자가 들어간 항목';
    else if (markup.test(item.title) || (item.paragraphs ?? []).some((line) => markup.test(line) || copied(line))
      || steps.some((step) => copied(step))) {
      dropped = '원문을 그대로 옮긴 항목';
    }
    if (!dropped) {
      used.add(quote);
      sectionTitles.push(item.title);
      titles.set(item.category, sectionTitles);
    }
    return { item, dropped };
  });
}

/** The operation fields as one indented block under a card. */
function printOperation(operation) {
  if (!operation) return;
  const { timing = {}, resources = {} } = operation;
  const line = (label, value) => { if (value) console.log(`   · ${label}: ${value}`); };
  line('목적', operation.purpose);
  line('주기·시작·마감', [timing.cycle, timing.trigger, timing.deadline].filter(Boolean).join(' / '));
  line('협업', (operation.collaborators ?? []).map((one) => `${one.department}(${one.role})`).join(', '));
  line('자원', [...(resources.systems ?? []), ...(resources.documents ?? []), ...(resources.outputs ?? [])].join(', '));
  line('절차', (operation.steps ?? []).join(' → '));
  line('선행', (operation.prerequisites ?? []).join(', '));
  line('후속', (operation.followUp ?? []).join(', '));
  (operation.controls ?? []).forEach((one) => console.log(
    `   · 통제: [${one.condition}] ${one.owner} → ${one.action}${one.escalation ? ` (보고: ${one.escalation})` : ''}`));
}

/** Every word an operation states, as ImportService assembles it for the number check. */
function operationProse(operation) {
  if (!operation) return '';
  const { timing = {}, resources = {} } = operation;
  return [
    operation.purpose, timing.cycle, timing.trigger, timing.deadline,
    ...(operation.collaborators ?? []).flatMap((one) => [one.department, one.role]),
    ...(resources.systems ?? []), ...(resources.documents ?? []), ...(resources.outputs ?? []),
    ...(operation.steps ?? []), ...(operation.prerequisites ?? []), ...(operation.followUp ?? []),
    ...(operation.controls ?? []).flatMap((one) => [one.condition, one.owner, one.action, one.escalation]),
  ].filter(Boolean).join(' ');
}

function report(answer, source) {
  if (flags.has('--json')) {
    console.log(JSON.stringify(answer, null, 2));
    return;
  }

  if (route === 'import') {
    const verdicts = importVerdicts(answer.items ?? [], source);
    const kept = verdicts.filter((verdict) => !verdict.dropped);
    const counts = {};
    kept.forEach(({ item }) => { counts[item.category] = (counts[item.category] ?? 0) + 1; });
    const groups = answer.workflowGroups ?? [];
    console.log(`원문 ${source.length}자 · 제안 ${verdicts.length}건 · 채택 ${kept.length}건 · 업무단위 ${groups.length}개`);
    console.log(`섹션: ${domain.categories.map((c) => `${domain.categoryLabels[c]} ${counts[c] ?? 0}`).join(' · ')}\n`);
    if (groups.length) {
      console.log('--- 업무 흐름 ---');
      groups.forEach((group, at) => console.log(`  ${at + 1}. ${group.title}`
        + `  [항목 ${(group.itemIds ?? []).join(', ')}]`
        + `${group.after?.length ? `  ← ${group.after.join(', ')}` : ''}`));
      console.log();
    }
    for (const { item } of kept) {
      console.log(`[${item.category}] ${item.title}  (${item.id ?? '-'} / ${item.workflowId ?? '-'})`);
      (item.paragraphs ?? []).forEach((line) => console.log(`   ${line}`));
      printOperation(item.operation);
      if (item.questions?.length) console.log(`   확인필요: ${item.questions.join(' / ')}`);
      console.log(`   근거: "${item.sourceQuote}"`
        + `${(item.evidence ?? []).length ? ` (+근거 ${item.evidence.length}건: ${item.evidence.map((one) => one.sourceId).join(',')})` : ''}`
        + `  properties=${JSON.stringify(item.properties)}\n`);
    }
    const dropped = verdicts.filter((verdict) => verdict.dropped);
    if (dropped.length) {
      console.log('--- 제외 ---');
      dropped.forEach(({ item, dropped: why }) => {
        console.log(`  (${why}) [${item.category}] ${item.title}`);
        /* The quote and the prose are what a rejection has to be diagnosed from. */
        console.log(`     근거: "${item.sourceQuote}"`);
        (item.paragraphs ?? []).forEach((line) => console.log(`     ${line}`));
      });
    }
    console.log(`\nunmapped: ${JSON.stringify(answer.unmapped)}`);
    /* Which units of the source no card claims: the whole point of numbering them. */
    const claimed = new Set((answer.items ?? []).flatMap((item) => (item.evidence ?? []).map((one) => one.sourceId)));
    const missed = (answer.segments ?? []).filter((segment) => !claimed.has(segment.id));
    if (missed.length) {
      console.log(`\n--- 근거로 쓰이지 않은 조각 ${missed.length}/${(answer.segments ?? []).length} ---`);
      missed.slice(0, 20).forEach((segment) => console.log(`  ${segment.id}: ${normalize(segment.text).slice(0, 100)}`));
    }
    return;
  }


  if (route === 'quality') {
    (answer.findings ?? []).forEach((finding) => {
      console.log(`[${finding.severity}] ${finding.kind} · ${finding.entryId} · "${finding.quote}"`);
      console.log(`   ${finding.message}\n   → ${finding.suggestion}`);
    });
    return;
  }

  if (route === 'calendar-check') {
    (answer.items ?? []).forEach((item) => {
      console.log(`${item.action} ${item.shiftWeeks >= 0 ? '+' : ''}${item.shiftWeeks}주  ${item.taskTitle}  anchor=${item.anchorEvent || '-'}`);
      console.log(`   ${item.reason}${item.note ? `\n   확인: ${item.note}` : ''}`);
    });
    return;
  }

  for (const item of answer.drafts ?? answer.items ?? []) {
    const trailer = item.action ? `[${item.action}] ` : '';
    console.log(`${trailer}[${item.category}] ${item.title}${item.sourceTask ? `  ← ${item.sourceTask}` : ''}`);
    if (item.reason) console.log(`   사유: ${item.reason}`);
    (item.paragraphs ?? []).forEach((line) => console.log(`   ${line}`));
    if (item.questions?.length) console.log(`   확인필요: ${item.questions.join(' / ')}`);
    console.log();
  }
}

const { user, users, source, segments } = await buildUser();
const messages = users ?? [user];
const started = Date.now();
/* The parts run together, as the service runs them, so the clock reads what a caller would wait. */
const completions = await Promise.all(messages.map((message) => ask(message)));
const failed = completions.find((completion) => completion.error);
if (failed) {
  console.error(failed.error);
  process.exit(1);
}
const answers = completions.map((completion) => JSON.parse(completion.choices[0].message.content));
const tokens = completions.reduce((total, completion) => total + (completion.usage?.total_tokens ?? 0), 0);
console.error(`${route} · ${((Date.now() - started) / 1000).toFixed(0)}초 · ${messages.length}회 호출 ·`
  + ` 입력 ${messages.reduce((total, message) => total + message.length, 0)}자 · 토큰 ${tokens}`);
report({
  ...answers[0],
  items: answers.flatMap((answer) => answer.items ?? []),
  workflowGroups: answers.flatMap((answer) => answer.workflowGroups ?? []),
  coverage: answers.flatMap((answer) => answer.coverage ?? []),
  ...(segments ? { segments } : {}),
  ...(answers[0].unmapped ? { unmapped: [...new Set(answers.flatMap((answer) => answer.unmapped ?? []))] } : {}),
}, source);
