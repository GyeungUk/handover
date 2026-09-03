# API 호환성 문서

Next.js Route Handlers(Cloudflare Workers + D1)와 Spring Boot 백엔드의 계약 비교입니다.
목표는 **프론트엔드를 수정하지 않고 백엔드만 교체하는 것**이었으므로, 요청 형식·응답 필드명·HTTP 상태
코드·한국어 오류 메시지를 모두 동일하게 맞췄습니다.

> **인증만은 더 이상 같지 않습니다.** ChatGPT 프록시 로그인을 직번·비밀번호 로그인으로 바꾸면서
> 신원 확인이 Spring 전용 기능(`/api/auth/*`, 세션 쿠키)이 되었습니다. D1 라우트 핸들러는 여전히
> `oai-authenticated-user-*` 헤더를 읽으므로 **현재 로그인 화면으로는 D1 백엔드를 쓸 수 없습니다.**
> 아래 2절의 도메인 엔드포인트 계약은 그대로 동일합니다.

기준 소스: `app/api/**/route.ts`, `app/authz.ts`, `app/chatgpt-auth.ts`, `app/ai-shared.ts`,
`app/handover-schema.ts`(문서 스키마와 `documentLimits`)

---

## 1. 공통 규칙

| 항목 | 기존 (Next.js / D1) | 신규 (Spring Boot / PostgreSQL) | 동일 여부 |
| --- | --- | --- | --- |
| 성공 응답 | `Response.json(payload)` → 200 | `ResponseEntity.ok(payload)` → 200 | 동일 |
| 오류 응답 본문 | `{ "error": "..." }` | `{ "error": "..." }` | 동일 |
| Content-Type | `application/json` | `application/json` | 동일 |
| 인증 방식 | `oai-authenticated-user-*` 헤더 | `handover_session` 쿠키 (`/api/auth/login`이 발급) | **다름** |
| 신원 | 이메일 | 직번. 이메일은 계정 정보이자 문서 저장 키로 유지 | **다름** |
| 이메일 정규화 | `email.toLowerCase()` | `email.toLowerCase(Locale.ROOT)` | 동일 |
| `displayName` | 디코딩된 full name, 없으면 email | 계정에 등록한 이름, 없으면 email | 동일 |
| 권한 판정 | `app/authz.ts` 하드코딩 | `handover.auth.admin-employee-ids` / `member-employee-ids` 설정 | **다름** |
| 스키마 생성 | 요청마다 `CREATE TABLE IF NOT EXISTS` | 기동 시 Flyway 1회 | **동작 동일, 방식 변경** |
| 알 수 없는 JSON 필드 | 무시 | 무시 (Spring Boot 기본값) | 동일 |

---

## 2. 엔드포인트별 비교

### /api/auth/\* — Spring 전용 (D1에 대응 없음)

로그인 화면은 직번 하나로 시작합니다. `/lookup`이 그 직번에 비밀번호가 있는지 알려 주고, 화면은
"비밀번호 만들기" 또는 "비밀번호 찾기"로 갈라집니다.

| 메서드 · 경로 | 요청 | 200 | 실패 |
| --- | --- | --- | --- |
| `GET /api/auth/session` | 없음 | `{ "user": {...} }` 또는 `{ "user": null }` | — (미로그인도 200) |
| `POST /api/auth/lookup` | `{ "employeeId" }` | `{ "status": "register"\|"reset", "maskedEmail": "k***@e***.kr"\|null }` | 400 숫자 아님 · 403 허용 목록에 없음 |
| `POST /api/auth/register` | `{ "employeeId", "name", "email", "password" }` | `{ "user": {...} }` + `Set-Cookie` | 400 형식 · 403 허용 목록 · 409 이미 존재 |
| `POST /api/auth/login` | `{ "employeeId", "password" }` | `{ "user": {...} }` + `Set-Cookie` | 401 불일치 · 429 시도 과다 |
| `POST /api/auth/logout` | 없음 | `{ "ok": true }` + 쿠키 만료 | — |
| `POST /api/auth/password/reset-request` | `{ "employeeId" }` | `{ "maskedEmail": "k***@e***.kr" }` | 404 계정 없음 · 429 요청 과다 · 503 메일 미설정 |
| `POST /api/auth/password/reset` | `{ "employeeId", "code", "password" }` | `{ "user": {...} }` + `Set-Cookie` | 400 인증번호 오류·만료 · 429 시도 과다 |

`user`는 `{ "employeeId", "displayName", "email", "role" }`이고 `role`은 `admin` 또는 `member`입니다.

게이트웨이 공유 비밀이 설정된 배포에서는 위 엔드포인트 전부가 그 헤더 없이는 403입니다.

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

### GET /api/task-checklists · POST /api/task-checklists

업무 상세의 세 준비사항을 실제로 저장합니다. GET은 `personId`와 `taskTitle` 쿼리를 받고, 항상 고정된
세 key를 순서대로 반환합니다. 아직 건드리지 않은 항목은 `completed: false`, `updatedBy: null`,
`updatedAt: null`입니다.

POST 요청은 `{ personId, taskTitle, itemKey, completed }`, 응답은 `{ "item": { key, completed,
updatedBy, updatedAt } }`입니다. `itemKey`는 `result-report`, `schedule-share`, `contact-refresh` 중 하나이며,
체크 해제도 같은 방식으로 저장됩니다. 두 구현 모두 업무 존재 여부를 확인하고 `(taskKey, itemKey)`를
upsert하므로 사용자 화면을 다시 열어도 상태가 유지됩니다.

### GET /api/handover · PUT /api/handover · POST /api/handover

저장된 인수인계서 한 건(계정당 1건)과 그 결재 흐름입니다. `entries`·`bundles`는 항상 **문서 전체가
통째로** 저장되므로, 순서를 지키는 것은 `position` 컬럼입니다.

| | 기존 | 신규 |
| --- | --- | --- |
| GET 200 | `{ "document": {...} \| null, "viewerRole": "admin" \| "member", "pendingDocuments": [...] }` | `pendingDocuments` → `submittedDocuments`. 관리자에게만 **제출된 모든 문서**(`pending`·`rejected`·`approved`)의 요약을 검토 대기·오래된 순으로 먼저 주고, 일반 계정은 빈 배열 |
| `submittedDocuments[]` | `{ ownerEmail, ownerName, status, updatedAt }` | `{ ownerEmail, ownerName, status, updatedAt, submittedAt, reviewedAt, reviewedBy }` |
| GET `?owner=` | 관리자만 타인 문서 열람, 그 외 403 | 동일 |
| PUT 요청 | `{ entries, bundles }` | 동일 |
| PUT / POST 200 | `{ "document": { ... } }` | 동일 |
| `document` | `{ ownerName, status, entries, bundles, updatedAt, submittedAt, reviewedAt, reviewedBy }` | 동일 |
| `entries[]` | `{ id, category, title, detail, properties, attachments, formatting }` | 동일 |
| `attachments[]` | `{ id, name, size, type, url }` — `url`은 **항상 빈 문자열** | 동일 |
| `bundles[]` | `{ id, title, entryIds, decision, comment }` — 미검토는 `decision: null` | 동일 |
| 타임스탬프 | `new Date().toISOString()` — UTC, 밀리초 3자리 | 동일 문자열 (`Timestamps`) |

첨부파일은 **메타데이터만** 저장합니다. `url`은 브라우저가 만든 object URL이라 탭을 벗어나면 의미가
없으므로 저장하지 않고, 다시 읽을 때 빈 문자열로 돌려줍니다. 워크스페이스는 이를 "다시 첨부 필요"로
표시합니다.

검증 순서와 메시지도 동일합니다.

| 메서드 | 상태 | 메시지 |
| --- | --- | --- |
| 공통 | 401 | `로그인이 필요합니다.` |
| GET | 403 | `다른 담당자의 인수인계서는 열 수 없습니다.` |
| PUT | 409 | `검토 중인 문서는 수정할 수 없습니다.` / `승인된 문서는 수정할 수 없습니다.` |
| PUT | 400 | `항목 목록을 보내주세요.` · `알 수 없는 섹션입니다.` · `항목 id가 중복되었습니다.` · `존재하지 않는 항목이 업무 단위에 연결되어 있습니다.` · `한 항목을 여러 업무 단위에 배치할 수 없습니다.` · 길이 초과 메시지 |
| POST | 400 | `알 수 없는 요청입니다.` (action이 `rollover`/`submit`/`review`가 아닐 때) |
| POST `rollover` | 404 / 409 | `갱신할 인수인계서가 없습니다.` / `파트장 검토가 끝난 후 연간 업데이트를 시작할 수 있습니다.` |
| POST `submit` | 404 / 409 | `저장된 인수인계서가 없습니다.` / `이미 제출된 문서입니다.` |
| POST `submit` | 400 | `작성된 항목이 없습니다.` · `담당업무 단위를 하나 이상 만들어 주세요.` · `이름이 비어 있는 담당업무 단위가 있습니다.` · `항목이 없는 담당업무 단위가 있습니다.` · `모든 항목을 담당업무 단위에 배치해야 제출할 수 있습니다.` |
| POST `review` | 403 / 404 / 409 | `파트장 권한이 필요합니다.` / `검토할 인수인계서가 없습니다.` / `검토 대기 중인 문서가 아닙니다.` |
| POST `review` | 400 | `승인 또는 반려 중 하나를 선택해 주세요.` · `반려한 업무 단위에는 보완 요청 코멘트가 필요합니다.` · `모든 담당업무 단위를 검토해야 합니다.` |

상태 전이는 `draft`/`rejected`에서만 수정할 수 있습니다. `rollover`는 승인 완료 문서의 검토 정보를
정리하고 다음 학년도 `draft`로 전환하며, `submit`은 직전 검토 의견을 지웁니다(재제출은
검토를 처음부터 다시 받습니다). 반려가 하나라도 있으면 문서 전체가 `rejected`입니다.

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
| 4 | 413 | `정확한 분류를 위해 자료를 100,000자 이하로 나누어 올려 주세요.` |

200 응답: `{ fileName, charCount, items: [...], unmapped: [...], sections: { ... } }` — `sections`까지 동일하게 포함.
`sourceQuote`가 정규화된 원문에 실제로 포함되고 다른 항목의 근거와 중복되지 않을 때만 항목을 유지합니다.
원문에 없는 숫자를 만든 항목도 제거합니다. 최대 200건, 미분류 50건입니다.

### POST /api/quality

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 503 | `점검 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.` |
| 3 | 400 | `점검할 항목이 없습니다.` (entries 비었음) |
| 4 | 400 | `점검할 내용이 없습니다.` (필터 후 남은 항목 없음) |

200 응답: `{ checked, findings: [{ id, entryId, kind, severity, quote, message, suggestion }] }`.
저장 가능한 200개 항목과 항목당 20,000자 본문을 잘라내지 않고 최대 20개씩 나누어 점검합니다.
quote 검증, 항목당 3건 상한, `high` 우선 정렬 모두 동일합니다. **id는 정렬 전에 부여**됩니다.

### POST /api/annual

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 503 | `연간 갱신 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.` |
| 3 | 400 | `갱신할 항목이 없습니다. 먼저 인수인계 항목을 작성해 주세요.` |
| 4 | 413 | 한 번에 80개 초과, 항목 본문 20,000자 초과 또는 전체 본문 600,000자 초과 |

200 응답: `{ fromYear, toYear, reviewed, items: [...] }`. 모델이 건너뛴 항목을 `keep`으로 보존하는 동작,
`archive`의 questions 제거, `revise → new → archive → keep` 정렬까지 동일합니다. `revise`·`archive`·`new`는
기존 제목/본문의 `evidenceQuote`가 검증되어야 하며, 원문에 없는 수치를 만든 제안은 `keep`으로 안전하게 되돌립니다.

### POST /api/calendar-check

| 순서 | 상태 | 메시지 |
| --- | --- | --- |
| 1 | 401 | `로그인이 필요합니다.` |
| 2 | 503 | `학사일정 점검 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.` |
| 3 | 400 | `담당자를 찾을 수 없습니다.` |
| 4 | 400 | `비교할 학사일정이 없는 학년도입니다.` |

200 응답: `{ person, fromYear, toYear, shifts, items, actionLabels }` — `actionLabels`까지 동일.
근거(anchor)와 업무 원문 `evidenceQuote` 검증, ±4주 clamp, 잘못된 이동의 `review` 강등,
원문 근거가 없는 이동의 `keep` 복귀, 누락 업무의 `keep` 보존, 정렬 규칙이 동일합니다.

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
| 7 | 개발용 계정 | 환경변수 허용 목록에 있을 때만 접근 | 동일 | 코드에 박힌 우회 계정을 제거해 운영·개발의 권한 판정이 같음 |
| 8 | `removed_at` / `changed_at` 저장 타입 | TEXT(ISO 문자열) | `timestamptz` | 응답 문자열은 동일. 정렬이 문자열 비교에서 시각 비교로 바뀜(결과 동일) |
| 9 | `task_reschedules.id` | `INTEGER AUTOINCREMENT` | `bigint GENERATED BY DEFAULT AS IDENTITY` | 응답에 id는 포함되지 않음. 순서 의미 동일 |
| 10 | 동시 요청 시 스키마 생성 | 요청마다 `CREATE TABLE IF NOT EXISTS` | 기동 시 1회 | 성능 개선 |
| 11 | 401/403 판정 시점 | 라우트마다 코드로 분기 | 동일하게 컨트롤러에서 분기 | 동일(특히 `/api/members`의 403 우선순위 유지) |
| 12 | `handover_entries` / `handover_bundles` 기본키 | `(owner_email, entry_id)` 복합 PK | 대리키 `id` + `UNIQUE (owner_email, entry_id)` | 응답에 노출되지 않음. JPA가 `@IdClass` 없이 매핑하기 위한 선택이며 유일성 제약은 동일 |
| 13 | 문서 삭제 시 하위 행 | 애플리케이션이 함께 삭제 | 위 + `ON DELETE CASCADE` 외래키 | DB가 고아 행을 막아줌 |
| 14 | `status` 값 검증 | 애플리케이션만 검증 | 위 + `CHECK` 제약 | 동일. DB 차원의 방어가 추가됨 |

---

## 4. 실제 모델 호출 대조 결과

같은 입력으로 양쪽 백엔드를 실제 `gpt-5.4-mini`에 호출해 비교했습니다. 5개 엔드포인트 모두
**상태 코드 · 최상위 키 · 항목 필드 합집합이 동일**했고, 서버측 도메인 규칙 위반은 0건이었습니다.
자세한 내용은 README 10절에 있습니다.

모델은 비결정적이므로 항목 개수와 문구는 호출마다 다릅니다. 같은 백엔드를 두 번 호출해도 그렇습니다.

## 5. 확인하지 못한 항목

- 실제 SMTP 서버로 발송되는 비밀번호 재설정 메일. 통합 테스트는 메일러를 스텁으로 두고 인증번호만 확인합니다.
- 브라우저에서 수행한 종단 간 로그인 흐름(자동화 테스트는 MockMvc 수준까지입니다).
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
