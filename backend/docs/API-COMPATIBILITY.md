# API 호환성 문서

Next.js Route Handlers(Cloudflare Workers + D1)와 Spring Boot 백엔드의 계약 비교입니다.
목표는 **프론트엔드를 수정하지 않고 백엔드만 교체하는 것**이므로, 요청 형식·응답 필드명·HTTP 상태
코드·한국어 오류 메시지를 모두 동일하게 맞췄습니다.

기준 소스: `app/api/**/route.ts`, `app/authz.ts`, `app/chatgpt-auth.ts`, `app/ai-shared.ts`

---

## 1. 공통 규칙

| 항목 | 기존 (Next.js / D1) | 신규 (Spring Boot / PostgreSQL) | 동일 여부 |
| --- | --- | --- | --- |
| 성공 응답 | `Response.json(payload)` → 200 | `ResponseEntity.ok(payload)` → 200 | 동일 |
| 오류 응답 본문 | `{ "error": "..." }` | `{ "error": "..." }` | 동일 |
| Content-Type | `application/json` | `application/json` | 동일 |
| 인증 헤더 | `oai-authenticated-user-id`, `oai-authenticated-user-email`, `oai-authenticated-user-full-name`, `oai-authenticated-user-full-name-encoding` | 동일한 헤더명 | 동일 |
| 이메일 정규화 | `email.toLowerCase()` | `email.toLowerCase(Locale.ROOT)` | 동일 |
| `displayName` | 디코딩된 full name, 없으면 email | 동일 | 동일 |
| 권한 판정 | `app/authz.ts` 하드코딩 | `handover.auth.admin-emails` / `member-emails` 설정 | **값의 출처만 변경** |
| 스키마 생성 | 요청마다 `CREATE TABLE IF NOT EXISTS` | 기동 시 Flyway 1회 | **동작 동일, 방식 변경** |
| 알 수 없는 JSON 필드 | 무시 | 무시 (Spring Boot 기본값) | 동일 |

---

## 2. 엔드포인트별 비교

### GET /api/members

| | 기존 | 신규 |
| --- | --- | --- |
| 요청 | 본문 없음 | 동일 |
| 200 | `{ "removedMemberIds": ["minseo", ...] }` | 동일 |
| 정렬 | `ORDER BY removed_at DESC` | `findAllByOrderByRemovedAtDesc()` | 
| 401 | `로그인이 필요합니다.` (미인증 **또는 미등록 계정**) | 동일 |

### POST /api/members · DELETE /api/members

| | 기존 | 신규 |
| --- | --- | --- |
| 요청 | `{ "personId": "minseo" }` | 동일 |
| 200 | `{ "ok": true }` | 동일 |
| 403 | `관리자 권한이 필요합니다.` — **미인증 호출도 401이 아니라 403** | 동일 |
| 400 | `유효한 파트원 정보가 필요합니다.` | 동일 |
| id 검증 | 하드코딩된 12개 id 집합 | 조직도(`org-data.json`)의 12개 id | 값 동일 |
| POST 저장 | `INSERT OR REPLACE` | 트랜잭션 내 조회 후 upsert (재삭제 시 시각 갱신) | 결과 동일 |

### GET /api/schedules

| | 기존 | 신규 |
| --- | --- | --- |
| 200 | `{ "changes": [{ taskKey, personId, taskTitle, fromStart, toStart, reason, changedBy, changedAt }] }` | 동일 |
| 정렬 | `ORDER BY id ASC` | `findAllByOrderByIdAsc()` | 동일 |
| `changedAt` | `new Date().toISOString()` — UTC, 밀리초 3자리 | 동일 문자열로 직렬화 (`Timestamps`) | **문자열 동일** |
| 401 | `로그인이 필요합니다.` | 동일 |

### POST /api/schedules

요청: `{ personId, taskTitle, toStart, reason }` · 응답: `{ "change": { ... } }`

검증 순서까지 동일합니다(프론트는 먼저 도착한 메시지를 그대로 표시하므로 순서가 계약의 일부입니다).

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 400 | `유효한 업무 정보가 필요합니다.` |
| 3 | 400 | `존재하지 않는 업무입니다.` |
| 4 | 400 | `변경할 일정이 2026학년도 안에 있어야 합니다.` |
| 5 | 400 | `일정 변경 사유를 입력해 주세요.` (trim 후 2자 미만) |
| 6 | 400 | `변경 사유는 300자 이내로 입력해 주세요.` |
| 7 | 400 | `현재와 동일한 일정입니다.` |

`fromStart`는 두 구현 모두 "해당 task의 가장 최근 변경값, 없으면 시드 시작 주"입니다.

### POST /api/draft

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 503 | `AI 초안 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.` |
| 3 | 400 | `담당자를 찾을 수 없습니다.` |
| 4 | 400 | `2026학년도 기간에만 초안을 만들 수 있습니다.` |
| — | 502 | `요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.` / `결과 형식을 읽지 못했습니다. 다시 시도해 주세요.` |

200 응답: `{ person: { id, name, role, team }, todayLabel, drafts: [{ id, category, title, detail, properties, basis, questions, sourceTask }] }` — 동일.

후처리 규칙도 동일합니다: 최대 8건, questions 최대 3개, title 80자, `basis`는 `record`가 아니면 `inferred`,
`properties`는 `importance / impact / response / priority`만 허용, `sourceTask`가 비면 섹션 라벨로 대체.

### POST /api/import

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 503 | `자동 분류 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.` |
| 3 | 400 | `읽을 내용이 너무 짧습니다. 자료를 다시 올리거나 내용을 붙여넣어 주세요.` (trim 후 30자 미만) |

200 응답: `{ fileName, charCount, items: [...], unmapped: [...], sections: { ... } }` — `sections`까지 동일하게 포함.
`sourceQuote`는 정규화된 원문에 실제로 포함될 때만 유지, 아니면 빈 문자열. 최대 16건, 미분류 4건.

### POST /api/quality

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 503 | `점검 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.` |
| 3 | 400 | `점검할 항목이 없습니다.` (entries 비었음) |
| 4 | 400 | `점검할 내용이 없습니다.` (필터 후 남은 항목 없음) |

200 응답: `{ checked, findings: [{ id, entryId, kind, severity, quote, message, suggestion }] }`.
quote 검증, 항목당 3건 · 전체 20건 상한, `high` 우선 정렬 모두 동일. **id는 정렬 전에 부여**되는 점까지 동일.

### POST /api/annual

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 503 | `연간 갱신 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.` |
| 3 | 400 | `갱신할 항목이 없습니다. 먼저 인수인계 항목을 작성해 주세요.` |

200 응답: `{ fromYear, toYear, reviewed, items: [...] }`. 모델이 건너뛴 항목을 `keep`으로 보존하는 동작,
`archive`의 questions 제거, `revise → new → archive → keep` 정렬까지 동일.

### POST /api/calendar-check

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 503 | `학사일정 점검 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.` |
| 3 | 400 | `담당자를 찾을 수 없습니다.` |
| 4 | 400 | `비교할 학사일정이 없는 학년도입니다.` |

200 응답: `{ person, fromYear, toYear, shifts, items, actionLabels }` — `actionLabels`까지 동일.
근거(anchor) 검증, ±4주 clamp, 근거 없는 `shift`의 `review` 강등, 누락 업무의 `keep` 보존, 정렬 규칙 동일.

---

## 3. 알려진 차이점

프론트를 수정하지 않아도 동작하지만, 완전히 같지는 않은 지점입니다.

| # | 상황 | 기존 | 신규 | 영향 |
| --- | --- | --- | --- | --- |
| 1 | **Origin** | 프론트와 API가 같은 오리진 | 앞단 프록시가 `/api/*`만 Spring으로 전달 (같은 오리진 유지) | **차이 없음.** 브라우저 입장에서는 여전히 `/api/*` 상대 경로. CORS 불필요. 다른 오리진으로 직접 호출하면 인증 헤더가 실리지 않아 성립하지 않음 |
| 2 | 본문이 JSON이 아님 | `request.json()` 예외 → **500** | **400** `요청 형식을 읽지 못했습니다.` | 개선. 프론트는 어느 쪽이든 오류로 표시 |
| 3 | 본문 자체가 없음(POST) | 예외 → **500** | 각 엔드포인트의 400 검증 메시지 | 개선 |
| 4 | OpenAI 호출 네트워크 실패 | 예외 → **500** | **502** `요청을 처리하지 못했습니다...` | 개선. 프론트는 `error` 필드를 읽으므로 표시는 동일 |
| 5 | OpenAI 타임아웃 | 없음(무한 대기) | 기본 120초 (`OPENAI_TIMEOUT`) | 초과 시 502 |
| 6 | `annual`의 `year`가 숫자가 아닌 문자열 | `Number(...) || 올해` → 올해 | 역직렬화 실패 → **400** | 프론트는 항상 숫자를 보내므로 실제 영향 없음 |
| 7 | 개발용 계정 `seedy@sites.test` | `NODE_ENV !== 'production'`이면 admin | 설정 파일에 넣을 때만 admin | 운영 안전성 개선. 로컬은 `application-local.yml`에 포함 |
| 8 | `removed_at` / `changed_at` 저장 타입 | TEXT(ISO 문자열) | `timestamptz` | 응답 문자열은 동일. 정렬이 문자열 비교에서 시각 비교로 바뀜(결과 동일) |
| 9 | `task_reschedules.id` | `INTEGER AUTOINCREMENT` | `bigint GENERATED BY DEFAULT AS IDENTITY` | 응답에 id는 포함되지 않음. 순서 의미 동일 |
| 10 | 동시 요청 시 스키마 생성 | 요청마다 `CREATE TABLE IF NOT EXISTS` | 기동 시 1회 | 성능 개선 |
| 11 | 401/403 판정 시점 | 라우트마다 코드로 분기 | 동일하게 컨트롤러에서 분기 | 동일(특히 `/api/members`의 403 우선순위 유지) |

---

## 4. 실제 모델 호출 대조 결과

같은 입력으로 양쪽 백엔드를 실제 `gpt-5.4-mini`에 호출해 비교했습니다. 5개 엔드포인트 모두
**상태 코드 · 최상위 키 · 항목 필드 합집합이 동일**했고, 서버측 도메인 규칙 위반은 0건이었습니다.
자세한 내용은 README 10절에 있습니다.

모델은 비결정적이므로 항목 개수와 문구는 호출마다 다릅니다. 같은 백엔드를 두 번 호출해도 그렇습니다.

## 5. 확인하지 못한 항목

- 브라우저에서 실제 ChatGPT 인증 프록시를 거친 종단 간 로그인 흐름.
- 운영 D1의 실제 데이터로 수행한 마이그레이션.
  (로컬 D1 실제 데이터 4건으로는 전 과정을 검증했습니다 — `docs/MIGRATION-FROM-D1.md` 참고.)

## 6. 검증 방법

`/api/members`와 `/api/schedules`는 dev 프록시를 통해 실제로 호출해 확인했습니다. 두 백엔드를 구분하는
가장 간단한 지문은 **잘못된 JSON 본문**입니다.

```bash
curl -i -X POST localhost:3000/api/members \
  -H 'Cookie: __sites_local_auth=1' -H 'Content-Type: application/json' -d 'not json'
# Spring  → 400 {"error":"요청 형식을 읽지 못했습니다."}
# 기존 D1 → 500
```
