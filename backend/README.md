# 국제처 인수인계 백엔드 (Spring Boot)

기존 Next.js Route Handlers(Cloudflare Workers + D1) 백엔드를 Spring Boot + PostgreSQL로 대체하는
독립 실행형 서버입니다. **프론트엔드는 그대로 두고 백엔드만 교체**하는 것이 목표이므로, 요청 형식과
응답 필드명, HTTP 상태 코드, 한국어 오류 메시지를 기존 API와 동일하게 유지합니다.

기존 `app/api/**`와 D1 관련 코드는 **삭제하지 않았습니다.** 검증이 끝날 때까지 두 백엔드를 병행 운영할
수 있고, 프론트의 기본 동작은 여전히 기존 백엔드를 향합니다.

- 기술 스택: Java 21 · Spring Boot 3.5 · Gradle · Spring Web / Validation / Data JPA · Flyway · PostgreSQL 16
- 관련 문서
  - [`docs/API-COMPATIBILITY.md`](docs/API-COMPATIBILITY.md) — 기존 API와의 계약 비교표, 알려진 차이점
  - [`docs/SECURITY.md`](docs/SECURITY.md) — **인증 헤더 신뢰 모델과 배포 조건 (배포 전 필독)**
  - [`docs/MIGRATION-FROM-D1.md`](docs/MIGRATION-FROM-D1.md) — D1 데이터 이전 절차

---

## 1. 빠른 시작

### 사전 준비

- JDK 21 (`JAVA_HOME`이 21을 가리켜야 합니다. Gradle toolchain도 21로 고정되어 있습니다.)
- Docker (로컬 PostgreSQL 및 Testcontainers 기반 테스트용)

```bash
# 이 저장소의 JDK 21 경로 예시 (macOS)
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

### 실행

```bash
cd backend

# 1) 환경변수 파일 준비 — 실제 값은 커밋하지 마세요
cp .env.example .env
$EDITOR .env                       # 최소한 HANDOVER_ADMIN_EMAILS / MEMBER_EMAILS 를 채웁니다

# 2) PostgreSQL 기동
docker compose up -d
docker compose ps                  # healthy 확인

# 3) 애플리케이션 기동 (Flyway가 스키마를 자동 생성합니다)
./run-local.sh
```

`run-local.sh`는 `.env`를 읽고, `OPENAI_API_KEY`가 비어 있으면 프로젝트 루트의 `.dev.vars`에서
가져옵니다. **비밀값 사본을 두 개 두지 않기 위해서입니다** — 키는 `.dev.vars` 한 곳에만 있습니다.
JAVA_HOME이 없으면 JDK 21을 찾아 설정합니다.

직접 띄우고 싶다면:

```bash
set -a && source .env && set +a
export OPENAI_API_KEY=$(sed -n 's/^OPENAI_API_KEY=//p' ../.dev.vars | head -1)
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew bootRun
```

기본 포트는 8080입니다. 기동 로그에 Flyway가 `V1__removed_members.sql`, `V2__task_reschedules.sql`을
적용했다는 줄이 보이면 정상입니다.

> **이 머신 주의:** 네이티브 PostgreSQL이 이미 `localhost:5432`를 점유하고 있습니다. 컨테이너를 5432로
> 띄우면 Spring이 컨테이너가 아니라 그쪽에 붙어 `role "handover" does not exist`로 실패합니다.
> 그래서 `.env`에서 `POSTGRES_PORT=5433`과 `DATABASE_URL=...:5433/handover`를 씁니다.
> 확인: `lsof -nP -iTCP:5432 -sTCP:LISTEN`

### `.env` 대신 프로파일을 쓰고 싶다면

```bash
cp src/main/resources/application-local.yml.example src/main/resources/application-local.yml
$EDITOR src/main/resources/application-local.yml     # 이 파일은 gitignore 대상입니다
SPRING_PROFILES_ACTIVE=local ./gradlew bootRun
```

### 동작 확인

```bash
# 등록되지 않은(=헤더 없는) 요청은 401
curl -i localhost:8080/api/members

# 등록된 계정으로 조회
curl -s localhost:8080/api/members \
  -H 'oai-authenticated-user-id: local-test' \
  -H 'oai-authenticated-user-email: <HANDOVER_MEMBER_EMAILS에 넣은 주소>'
# → {"removedMemberIds":[]}
```

---

## 2. 설정

모든 배포별 값은 환경변수입니다. 자세한 목록은 `.env.example`을 보세요.

| 환경변수 | 용도 | 비고 |
| --- | --- | --- |
| `DATABASE_URL` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` | DB 접속 | 비밀번호는 커밋 금지 |
| `HANDOVER_ADMIN_EMAILS` | 관리자 이메일 (쉼표 구분) | `app/authz.ts` 하드코딩을 대체 |
| `HANDOVER_MEMBER_EMAILS` | 파트원 이메일 (쉼표 구분) | 둘 다 비면 **아무도 접근 불가** |
| `HANDOVER_GATEWAY_SECRET` | 프록시 공유 비밀 (선택) | 설정 시 이 헤더가 없으면 미인증 처리 |
| `HANDOVER_CORS_ALLOWED_ORIGINS` | 허용 오리진 (쉼표 구분) | 비우면 CORS 매핑 없음 |
| `OPENAI_API_KEY` | 모델 호출 키 | `.env`는 비워 두고 `run-local.sh`가 `.dev.vars`에서 읽습니다. 없으면 AI 엔드포인트가 503 |
| `OPENAI_MODEL` | 기본 `gpt-5.4-mini` | 기존과 동일 |
| `SERVER_PORT` | 기본 8080 | |
| `HANDOVER_DRAFT_INFERABLE_PROPERTY_KEYS` | 초안이 자동으로 채워도 되는 속성 key | 기본 `importance,impact,response,priority` |

---

## 3. 데이터베이스

### 마이그레이션

- 위치: `src/main/resources/db/migration`
- `V1__removed_members.sql`, `V2__task_reschedules.sql`
- 애플리케이션 기동 시 Flyway가 자동 적용합니다. 기존 구현이 요청마다 실행하던
  `CREATE TABLE IF NOT EXISTS`는 더 이상 필요하지 않습니다.
- Hibernate는 `ddl-auto: validate`로 동작합니다. 스키마와 엔티티 매핑이 어긋나면 **기동이 실패**합니다.

### 초기화 / 재생성

```bash
docker compose down -v     # 볼륨까지 삭제
docker compose up -d
./gradlew bootRun          # Flyway가 처음부터 다시 적용
```

### D1에서 옮기기

[`docs/MIGRATION-FROM-D1.md`](docs/MIGRATION-FROM-D1.md) 참고. 요약:

```bash
node backend/tools/import-d1.mjs \
  --removed-members  ./removed_members.json \
  --task-reschedules ./task_reschedules.json \
  --out backend/tools/out/import.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/tools/out/import.sql
```

Cloudflare에 접속하지 않고 로컬 CSV/JSON만 읽습니다. 여러 번 실행해도 안전하며 identity 시퀀스를
자동으로 재설정합니다.

---

## 4. 구현된 API

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/members` | 등록 계정 | 방출된 파트원 id 목록 |
| POST | `/api/members` | **관리자** | 파트원 방출 |
| DELETE | `/api/members` | **관리자** | 파트원 복구 |
| GET | `/api/schedules` | 등록 계정 | 일정 변경 이력 전체 |
| POST | `/api/schedules` | 등록 계정 | 일정 변경 기록 |
| POST | `/api/draft` | 등록 계정 | 담당자 일정 기반 인수인계 초안 |
| POST | `/api/import` | 등록 계정 | 기존 문서 4개 섹션 자동 분류 |
| POST | `/api/annual` | 등록 계정 | 다음 학년도 갱신 초안 |
| POST | `/api/quality` | 등록 계정 | 후임자 관점 품질 점검 |
| POST | `/api/calendar-check` | 등록 계정 | 학사일정 변동 대비 일정 조정 제안 |

요청/응답 상세와 오류 메시지는 [`docs/API-COMPATIBILITY.md`](docs/API-COMPATIBILITY.md)에 있습니다.

---

## 5. 값은 한 곳에만 씁니다

같은 값을 TypeScript와 Java에 각각 적어 두면 언젠가 조용히 어긋납니다. 조직도·학사일정·라벨·열거값은
전부 **TypeScript가 원본**이고, 스크립트가 JSON으로 내보내 Java가 읽습니다.

```bash
# 저장소 루트에서 — app/org-data.ts 등을 수정한 뒤 반드시 다시 실행
node backend/tools/export-domain-data.mjs   # → backend/src/main/resources/domain/*.json
node backend/tools/export-prompts.mjs       # → backend/src/main/resources/ai/prompt/*.txt
```

| 스크립트 | 원본 | 결과물 |
| --- | --- | --- |
| `export-domain-data.mjs` | `app/org-data.ts`, `app/academic-calendar.ts`, `app/handover-schema.ts` | `domain/*.json` (조직도, 학사일정, 섹션/속성 정의, `annualActionLabels`, `alignmentActionLabels`) |
| `export-prompts.mjs` | `app/api/*/route.ts`의 `systemPrompt` | `ai/prompt/*.txt` |

### JSON Schema의 열거값

스키마 5개가 섹션 키와 액션 이름을 각자 적어 두면 6곳이 어긋날 수 있습니다. 그래서 스키마는 값을
직접 쓰지 않고 **출처를 가리킵니다.**

```json
"category": { "type": "string", "$enumFrom": "categories" }
```

`AiResources`가 로딩할 때 이 마커를 실제 배열로 바꿉니다. 사용 가능한 출처는 `categories`,
`findingKinds`, `annualActions`, `alignmentActions`이며, 모두 내보낸 도메인 데이터에서 옵니다.
없는 출처를 적으면 **기동 시 예외**로 걸립니다.

`basis`(record/inferred), `confidence`·`severity`(high/low)는 조직 데이터가 아니라 모델 답변의
성격을 나타내는 값이라 스키마에 그대로 둡니다.

### 학년도

기준 학년도는 `app/academic-calendar.ts`의 `baseAcademicYear`, 시작 월은 `app/org-data.ts`의
`months[0]`("3월")에서 읽습니다. Java에는 연도도 날짜도 박혀 있지 않습니다.

- 학년도 기간: `AcademicCalendar.startsOn()` ~ `endsBefore()`
- 오늘 위치: `AcademicCalendar.locateToday(...)`
- 오류 메시지의 "2026학년도"도 `baseYearLabel()`에서 만들어집니다

TypeScript 쪽도 같습니다. `locateToday`에 박혀 있던 `2026`/`2027`을 걷어내고
`org-data.ts`의 `ACADEMIC_YEAR_START` 한 곳에서 파생하도록 바꿨습니다.
`academic-calendar.ts`의 `baseAcademicYear`는 이제 그 값을 re-export 합니다.

**학년도를 넘길 때 고칠 곳은 `app/org-data.ts`의 `ACADEMIC_YEAR_START` 한 줄입니다.**
(학사일정 자체는 `academicYears` 데이터를 추가해야 합니다.) 바꾼 뒤
`node backend/tools/export-domain-data.mjs`를 다시 실행하면 백엔드도 따라옵니다.

### 여전히 코드에 있는 값

의도적으로 남긴 것들입니다.

| 값 | 위치 | 이유 |
| --- | --- | --- |
| 한국어 오류 메시지 | 각 서비스 | 프론트 호환 계약의 일부. 바꾸면 화면 문구가 바뀝니다 |
| 개수 상한 (초안 8건, 분류 16건 등) | 각 서비스 상수 | 기존 구현과 같은 값. 설정으로 뺄 수는 있으나 호환 기준선이라 고정 |
| 정렬 순서 (`REVIEW_ORDER`) | `AnnualService`, `CalendarCheckService` | 표시 정책이지 도메인 데이터가 아님 |
| `record`/`high`/`low` | 스키마 | 모델 답변의 성격 값 |

## 6. 테스트

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
./gradlew test          # 단위 + 슬라이스 테스트
./gradlew build         # 컴파일 + 전체 테스트 + jar
```

### Docker가 필요한 테스트

`FlywayMigrationTest`와 `ApiIntegrationTest`는 Testcontainers로 실제 PostgreSQL 16을 띄웁니다.
Docker 데몬이 없으면 **실패가 아니라 skip** 됩니다.

Docker Engine 29 이상에서는 Testcontainers가 API 버전 협상에 실패해 "no valid Docker environment"로
보고하는 문제가 있습니다. 이 경우 다음처럼 실행하세요.

```bash
DOCKER_API_VERSION=1.44 ./gradlew test
```

`build.gradle`이 이 환경변수를 테스트 JVM의 `api.version` 시스템 프로퍼티로 전달합니다. 구버전
데몬에서는 설정하지 마세요.

### 최근 실행 결과

`DOCKER_API_VERSION=1.44 ./gradlew build --rerun-tasks` 기준 **124개 테스트 전부 통과**
(실패 0, 오류 0, skip 0 — Testcontainers 테스트 포함).

---

## 7. 프론트엔드 연결 — **전환 완료됨**

`npm run dev`로 실행하면 이제 `/api/*`를 **Spring 백엔드가 처리합니다.**

### 왜 base URL 방식이 아니라 프록시인가

이 앱의 인증 헤더(`oai-authenticated-user-*`)는 **브라우저가 보내지 않습니다.** 앞단 서버가 주입합니다.

- 로컬: `@openai/sites-vite-plugin`의 Vite 미들웨어가 `__sites_local_auth` 쿠키를 보고 주입
  (`node_modules/@openai/sites-vite-plugin/dist/index.js:93`). 인바운드 헤더는 오히려 **제거**합니다.
- 운영: ChatGPT 인증 프록시가 주입

따라서 프론트에서 `fetch('http://spring-host/api/...')`처럼 **다른 오리진으로 직접 호출하면 신원이 실려
가지 않아 전부 401**이 됩니다. base URL 교체 방식은 이 구조에서 성립하지 않습니다.

대신 요청이 앞단을 통과한 **뒤에** Spring으로 전달되어야 합니다. 이는 운영의 리버스 프록시가 해야 할
일과 정확히 같습니다.

### 적용된 방식

`vite.config.ts`에 `springApiProxy` 플러그인을 추가했습니다.

- `configureServer`가 **함수를 반환**하므로 sites 플러그인의 헤더 주입 미들웨어보다 **뒤에** 등록됩니다.
  덕분에 전달 시점의 `request.headers`에 로그인 사용자가 이미 실려 있습니다.
- 플러그인 배열 맨 앞에 두어 앱 핸들러보다 먼저 `/api/*`를 가로챕니다.
- 같은 오리진이므로 **CORS도, 쿠키 SameSite 문제도 없습니다.**
- `app/api/**`의 기존 Route Handler는 **그대로 남아 있습니다.** 가로채지 않으면 예전처럼 동작합니다.

전환 스위치는 `.env.local` 한 줄입니다.

```
HANDOVER_API_TARGET=http://localhost:8080
```

### 되돌리기

`.env.local`에서 그 줄을 주석 처리하고 dev 서버를 재시작하면 됩니다. 즉시 기존 Next.js + D1로 돌아갑니다.
(실제로 확인했습니다. 두 백엔드는 데이터도 완전히 분리되어 있습니다.)

```bash
sed -i '' 's|^HANDOVER_API_TARGET=|#HANDOVER_API_TARGET=|' .env.local
```

### 프론트 코드는 건드리지 않았습니다

`WorkspaceClient.tsx`와 `HandoverWorkspace.tsx`의 fetch 호출 10곳은 **한 줄도 바꾸지 않았습니다.**
모두 `/api/*` 상대 경로 그대로입니다.

`app/api-base.ts`는 그대로 두었지만 **현재 방식에서는 필요하지 않습니다.** 프론트와 API를 서로 다른
오리진에 두면서 그 오리진 앞에도 인증 프록시를 세우는 배포를 하게 될 때만 쓰세요.

### 운영 배포

같은 원리입니다. 인증 프록시 뒤에서 경로로 나눕니다.

```
브라우저 → ChatGPT 인증 프록시 → ┬ /api/*  → Spring (8080)
                                  └ 그 외    → Next.js
```

프록시는 반드시 인바운드 `oai-authenticated-user-*` 헤더를 제거한 뒤 자신이 검증한 값으로 다시
설정해야 합니다. [`docs/SECURITY.md`](docs/SECURITY.md)를 보세요.

## 8. 로컬 개발에서 인증 흐름 흉내내기

dev 서버(3000)를 거치면 sites 플러그인이 헤더를 넣어 주므로, 쿠키만 있으면 됩니다.

```bash
curl -s localhost:3000/api/members -H 'Cookie: __sites_local_auth=1'
# → {"removedMemberIds":[]}
```

Spring(8080)을 직접 두드릴 때는 앞단이 없으므로 헤더를 손으로 넣습니다.

```bash
curl -s -X POST localhost:8080/api/schedules \
  -H 'Content-Type: application/json' \
  -H 'oai-authenticated-user-id: local-test' \
  -H 'oai-authenticated-user-email: seedy@sites.test' \
  -H "oai-authenticated-user-full-name: $(python3 -c 'import urllib.parse;print(urllib.parse.quote("박민서"))')" \
  -H 'oai-authenticated-user-full-name-encoding: percent-encoded-utf-8' \
  -d '{"personId":"minseo","taskTitle":"비자 연장 집중기간","toStart":23,"reason":"로컬 테스트"}'
```

`seedy@sites.test`를 쓰려면 `application-local.yml`의 관리자 목록에 넣어야 합니다.
(기존 구현은 `NODE_ENV !== 'production'`일 때 이 계정을 자동 허용했지만, 이 백엔드에는 그런 코드
경로가 없습니다. 운영 설정에는 절대 넣지 마세요.)

---

## 9. 프로젝트 구조

```
backend/
├── build.gradle                     Java 21 · Spring Boot 3.5 · Flyway · PostgreSQL
├── docker-compose.yml               로컬 PostgreSQL 16
├── run-local.sh                     .env + .dev.vars 로 환경을 채워 bootRun
├── .env.example                     환경변수 템플릿 (실제 값 없음)
├── docs/                            호환성 · 보안 · 데이터 이전 문서
├── tools/
│   ├── export-domain-data.mjs       TS 도메인 데이터 → JSON 리소스
│   ├── export-prompts.mjs           TS 프롬프트 → 텍스트 리소스
│   └── import-d1.mjs                D1 CSV/JSON → 검토 가능한 PostgreSQL SQL
└── src/main/java/com/globalaffairs/handover/
    ├── auth/                        ChatGPT 헤더 필터, 권한 판정, 접근 검사
    ├── config/                      CORS, 인자 리졸버, Clock
    ├── domain/                      조직도 · 학사일정 · 인수인계 스키마 포팅
    ├── member/                      /api/members
    ├── schedule/                    /api/schedules
    ├── ai/                          OpenAI 클라이언트와 5개 모델 기반 서비스
    └── web/                         오류 응답 계약, 타임스탬프 포맷
```

---

## 10. 확인 결과와 남은 항목

### 확인 완료

**영속 API**
- Flyway 마이그레이션 적용 (실제 PostgreSQL 16)
- `/api/members`, `/api/schedules` 전 경로: 조회 · 방출 · 복구 · 일정 변경 · 중복 거부 · 이력 조회
- 인증 헤더가 dev 프록시를 통해 Spring까지 전달됨 (`changedBy`에 실제 사용자명 기록)
- 미인증 401, 비관리자 403, 잘못된 본문 400
- `.env.local` 한 줄로 기존 D1 백엔드 왕복 전환

**데이터 이전**
- 로컬 D1 실제 데이터 4건 이전 — id(2·7·8·9) 보존, 재실행 안전, 이전 후 신규 삽입 id 충돌 없음,
  `changedAt` 문자열 동일

**실제 OpenAI 호출 (양쪽 백엔드 동일 입력으로 대조)**

| 엔드포인트 | 상태 | 최상위 키 | 항목 필드 | 도메인 규칙 위반 |
| --- | --- | --- | --- | --- |
| `/api/draft` | 200 / 200 | 동일 | 동일 | 0 |
| `/api/import` | 200 / 200 | 동일 | 동일 | 0 |
| `/api/quality` | 200 / 200 | 동일 | 동일 | 0 |
| `/api/annual` | 200 / 200 | 동일 | 동일 | 0 |
| `/api/calendar-check` | 200 / 200 | 동일 | 동일 | 0 |

내용도 실질적으로 같았습니다. 예: `calendar-check`가 양쪽 모두 "신입생 체류자격 변경"을
`후기 신입학 원서접수`(1주 이동)를 근거로 `3월 4주 → 4월 1주` 제안. `quality`는 양쪽 모두 같은
인용문("그 파일을", "늘 하던 대로")을 지적했고, 모두 원문에 실재함을 확인했습니다.

검증한 서버측 규칙: 섹션 키 유효성, 속성 허용 key만 통과, `basis`/`confidence`/`severity` 값 범위,
액션 값 범위, 인용문 실재 여부, 본문에 원시 태그 없음.

응답 시간은 2.1~4.9초였습니다. 기본 타임아웃 120초는 충분합니다.

> 모델은 비결정적이라 항목 **개수**와 일부 판단(`basis`가 `record`인지 `inferred`인지 등)은 호출마다
> 다릅니다. 이는 두 백엔드 사이의 차이가 아니라 같은 백엔드를 두 번 불러도 생기는 차이입니다.

### 아직 확인하지 못함

1. **브라우저 UI 조작.** API는 curl로 검증했고 페이지는 200으로 렌더되지만, 실제 브라우저에서
   버튼을 눌러가며 확인하지는 않았습니다.
2. **실제 ChatGPT 인증 프록시 뒤에서의 동작.** 로컬은 sites 플러그인이 프록시를 흉내낸 것입니다.
3. **운영 D1 데이터.** 이전 도구는 로컬 D1 실제 데이터(4건)로 검증했지만 운영 데이터 규모는 다릅니다.
4. **부하 / 동시성.** `POST /api/schedules`의 "최근값 조회 → 삽입"은 트랜잭션 안이지만 직렬화 수준은
   아닙니다. 같은 업무를 동시에 옮기면 두 행이 같은 `from_start`를 가질 수 있습니다. 기존 D1 구현도
   동일한 성질이었습니다. 필요하면 `task_key` 단위 잠금을 추가하세요.
5. **모델 응답의 장기적 품질 비교.** 각 엔드포인트를 1회씩만 호출했습니다. 통계적 비교는 아닙니다.
