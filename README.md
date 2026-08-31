# 국제처 업무 인수인계 워크스페이스

대학 국제처의 연간 업무를 조직도·학사일정과 함께 관리하고, 담당자가 바뀔 때 인수인계서를
AI 초안으로 만들어 검토·승인까지 처리하는 사내 워크스페이스입니다.

- **프론트엔드** — Next.js 16 (RSC) · React 19 · Tailwind 4
- **백엔드** — `backend/` · Spring Boot 3.5 · Java 21 · PostgreSQL 16 · Flyway
- **로그인** — 직번(숫자)과 비밀번호. 계정과 세션은 Spring 백엔드가 관리합니다.
- **기존 자료 읽기** — TXT·DOCX·HWP/HWPX·PDF·PNG/JPG·XLS/XLSX를 브라우저에서 추출해
  상세 AI 초안으로 분류합니다. 이미지에는 한국어·영어 OCR을 적용합니다.

`app/api/**`에는 예전 Cloudflare D1 구현이 남아 있습니다. 도메인 엔드포인트의 계약은 여전히 같지만
**인증은 다릅니다** — 그쪽은 ChatGPT 프록시의 신원 헤더를 읽으므로 지금 로그인 화면과 맞지 않습니다.
자세한 내용은 [`backend/README.md` §7](backend/README.md)에 있습니다.

> **운영 배포는 아직 옮겨지지 않았습니다.** 직번 로그인은 Spring 백엔드에만 있으므로, 배포하려면
> Spring을 띄울 호스트와 관리형 PostgreSQL, 그리고 프론트와 `/api/*`를 같은 오리진 뒤에 두는 리버스
> 프록시가 필요합니다.

---

## 빠른 시작

### 1. 백엔드 (Spring + PostgreSQL)

```bash
cd backend
cp .env.example .env               # 관리자 직번 목록을 채웁니다
docker compose up -d               # PostgreSQL 16
./run-local.sh                     # Flyway가 스키마를 만들고 8080에서 기동
```

### 2. 프론트엔드

```bash
npm install

cp .dev.vars.example .dev.vars     # HANDOVER_API_TARGET 과 OPENAI_API_KEY 를 채웁니다
cp .env.local.example .env.local   # HANDOVER_API_TARGET=http://localhost:8080
npm run dev                        # /api/* 가 Spring 으로 전달됩니다
```

`HANDOVER_API_TARGET`은 **두 파일 모두에** 같은 값으로 넣어야 합니다. `.env.local`은 dev 서버가
`/api/*`를 어디로 보낼지, `.dev.vars`는 페이지를 서버 렌더할 때 세션 주인을 어디에 물어볼지를 정합니다.

숫자로 된 모든 직번은 비밀번호를 만들고 일반 사용자로 로그인할 수 있습니다. 관리자 권한만
백엔드의 `HANDOVER_ADMIN_EMPLOYEE_IDS` 목록으로 정합니다.
`OPENAI_API_KEY`가 없으면 AI 5개 엔드포인트만 503을 반환하고 나머지 기능은 정상 동작합니다.

`backend/.env`에 `HANDOVER_GATEWAY_SECRET`를 설정했다면 `.env.local`과 `.dev.vars`에도 **같은 값**을
넣어야 합니다. 넣지 않으면 백엔드가 요청을 신뢰하지 않아 로그인부터 막힙니다.

> **D1 백엔드는 지금 로그인과 맞지 않습니다.** `app/api/**`는 여전히 ChatGPT 프록시의 신원 헤더를
> 읽으므로, `HANDOVER_API_TARGET`을 비우면 로그인할 수 없습니다. 도메인 엔드포인트의 계약은 그대로
> 같으니, 다시 쓰려면 그쪽에도 직번 인증을 옮겨야 합니다.

---

## 설정

비밀값은 저장소에 넣지 않습니다. 템플릿을 복사해 채우는 방식이며, 실제 값이 담긴 파일은 전부
`.gitignore` 대상입니다.

| 템플릿 | 복사본 | 용도 |
| --- | --- | --- |
| `.dev.vars.example` | `.dev.vars` | Worker 환경변수 — 세션을 물어볼 백엔드, OpenAI 키 |
| `.env.local.example` | `.env.local` | 개발 서버가 `/api/*` 를 보낼 백엔드, 게이트웨이 시크릿 |
| `backend/.env.example` | `backend/.env` | Spring 백엔드 DB·직번 허용 목록·세션·메일·CORS·OpenAI |

`backend/.env`의 `HANDOVER_ADMIN_EMPLOYEE_IDS`에는 관리자 직번을 쉼표로 구분해 적습니다. 목록 밖의
계정은 일반 사용자이며, `HANDOVER_MEMBER_EMPLOYEE_IDS`는 기존 설정 호환성을 위해 남아 있지만 가입을
제한하지 않습니다.

---

## API

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/auth/session` | 누구나 | 현재 로그인한 계정 (없으면 `user: null`) |
| POST | `/api/auth/lookup` | 누구나 | 직번 확인 — 비밀번호 만들기와 찾기 중 어디로 갈지 |
| POST | `/api/auth/register` | 숫자 직번 | 비밀번호 생성 후 바로 로그인 |
| POST | `/api/auth/login` | 누구나 | 직번·비밀번호 로그인 |
| POST | `/api/auth/logout` | 누구나 | 세션 종료 |
| POST | `/api/auth/password/reset-request` | 등록 계정 | 등록된 이메일로 인증번호 발송 |
| POST | `/api/auth/password/reset` | 등록 계정 | 인증번호 확인 후 새 비밀번호 설정 |
| GET | `/api/members` | 등록 계정 | 방출된 파트원 id 목록 |
| POST | `/api/members` | **관리자** | 파트원 방출 |
| DELETE | `/api/members` | **관리자** | 파트원 복구 |
| GET | `/api/schedules` | 등록 계정 | 일정 변경 이력 전체 |
| POST | `/api/schedules` | 등록 계정 | 일정 변경 기록 |
| GET | `/api/task-checklists` | 등록 계정 | 업무별 인수인계 준비 상태 조회 |
| POST | `/api/task-checklists` | 등록 계정 | 체크 항목 완료·해제 저장 |
| GET | `/api/handover` | 등록 계정 | 저장된 인수인계서 (관리자는 `?owner=`로 타인 문서) |
| PUT | `/api/handover` | 등록 계정 | 작성 중인 인수인계서 저장 |
| POST | `/api/handover` | 등록 계정 / **관리자** | `rollover` 다음 학년도 초안 · `submit` 제출 · `review` 파트장 검토 결과 |
| POST | `/api/draft` | 등록 계정 | 담당자 일정 기반 인수인계 초안 |
| POST | `/api/import` | 등록 계정 | 기존 문서 4개 섹션 자동 분류 |
| POST | `/api/annual` | 등록 계정 | 다음 학년도 갱신 초안 |
| POST | `/api/quality` | 등록 계정 | 후임자 관점 품질 점검 |
| POST | `/api/calendar-check` | 등록 계정 | 학사일정 변동 대비 일정 조정 제안 |

요청·응답 상세는 [`backend/docs/API-COMPATIBILITY.md`](backend/docs/API-COMPATIBILITY.md)를 보세요.

---

## 구조

```
├── app/                          Next.js App Router
│   ├── page.tsx                  세션 확인 후 로그인 화면 또는 워크스페이스로
│   ├── session.ts                서버 렌더에서 세션 주인 확인 (백엔드에 질의)
│   ├── LoginClient.tsx           직번 로그인 · 비밀번호 만들기 · 비밀번호 찾기
│   ├── WorkspaceClient.tsx       조직도 · 연간 일정 · 팀원 관리
│   ├── HandoverWorkspace.tsx     인수인계 편집기 · 검토 · 승인
│   ├── org-data.ts               조직도와 연간 업무 (단일 원본)
│   ├── academic-calendar.ts      학사일정 (단일 원본)
│   ├── handover-schema.ts        인수인계 4개 섹션·속성·저장 문서 타입 (단일 원본)
│   ├── authz.ts                  접근 허용 목록 판정 (레거시 — D1 라우트 전용)
│   ├── chatgpt-auth.ts           ChatGPT 프록시 신원 헤더 해석 (레거시 — D1 라우트 전용)
│   └── api/                      Route Handlers (레거시 D1 백엔드 — 직번 로그인 미지원)
├── db/schema.ts                  D1 테이블 정의 (대체 백엔드)
├── drizzle/                      D1 마이그레이션 (대체 백엔드)
├── backend/                      Spring Boot 백엔드 — 개발 기본값 (README 별도)
└── vite.config.ts                빌드 설정 + /api/* Spring 프록시 (게이트웨이 시크릿 부착)
```

### 도메인 데이터는 한 곳에만 씁니다

조직도·학사일정·인수인계 스키마의 원본은 `app/` 아래 TypeScript 파일입니다. Spring 백엔드가 읽는
`backend/src/main/resources/domain/*.json`은 손으로 옮기지 않고 스크립트로 생성합니다.

```bash
node backend/tools/export-domain-data.mjs   # 도메인 데이터
node backend/tools/export-prompts.mjs       # AI 프롬프트
```

TypeScript 쪽을 고쳤다면 위 스크립트를 다시 실행하세요. 실행하지 않으면 두 백엔드가 서로 다른
조직도를 보게 됩니다.

---

## 로그인

첫 화면은 **직번**과 **비밀번호** 두 칸입니다. 직번은 숫자만 입력할 수 있습니다.

그 아래 **`비밀번호 찾기 및 만들기`** 는 직번 하나로 시작합니다. 그 직번에 비밀번호가 있는지 서버가
확인해서,

- **처음 보는 직번이면** → 이름·이메일과 함께 비밀번호를 만들고 바로 로그인됩니다.
- **이미 있는 직번이면** → 등록해 둔 이메일로 6자리 인증번호를 보내고, 그 번호로 새 비밀번호를
  설정합니다.

직번은 숫자만 입력하면 됩니다. 새 직번은 비밀번호를 만들고, 이미 등록된 직번은 이메일 인증을 거쳐
비밀번호를 재설정합니다. 관리자는 `HANDOVER_ADMIN_EMPLOYEE_IDS` 목록으로만 정합니다.

- 비밀번호는 PBKDF2-HMAC-SHA256으로 저장하며 평문은 어디에도 남지 않습니다.
- 세션은 `HttpOnly` 쿠키이고, DB에는 토큰의 해시만 저장합니다.
- 비밀번호를 바꾸면 그 계정의 다른 세션은 모두 끊깁니다.
- 인증번호를 보내려면 SMTP 설정이 필요합니다. 없으면 재설정 요청이 503으로 실패합니다. 로컬에서는
  `HANDOVER_PASSWORD_RESET_LOG_CODE=true`로 두면 로그에 찍힙니다.

자세한 배포 조건은 [`backend/docs/SECURITY.md`](backend/docs/SECURITY.md)에 있습니다.

---

## 인수인계서 저장

작성한 인수인계서는 **계정마다 한 건** 저장됩니다. 항목·담당업무 단위·결재 상태·파트장 코멘트가
모두 DB에 남으므로, 브라우저를 닫아도 이어서 작성할 수 있습니다.

- **자동 저장** — 항목이나 업무 단위를 바꾸면 약 1.2초 뒤에 저장되고, 상단에 저장 시각이 표시됩니다.
- **잠금** — 제출(`검토 대기`)하거나 승인이 끝난 문서는 수정할 수 없습니다. 반려되면 다시 열립니다.
- **재제출** — 다시 제출하면 직전 검토 의견이 지워지고 검토가 처음부터 진행됩니다.
- **파트장 검토** — 관리자 화면의 검토 대기 목록에서 작성자를 선택해 문서별로 승인·반려합니다.
- **첨부파일** — 파일 이름·크기·형식만 저장합니다. 파일 내용 자체는 저장하지 않으므로, 문서를 다시
  불러오면 해당 첨부는 `다시 첨부 필요`로 표시됩니다. 파일 본문까지 남기려면 R2 같은 객체 스토리지가
  따로 필요합니다.

저장되는 테이블은 `handover_documents` · `handover_entries` · `handover_bundles` 세 개이며,
Spring은 Flyway `V3__handover_documents.sql`, D1은 `drizzle/0002_handover_documents.sql`이
만듭니다. 계정·세션·인증번호는 `V4__accounts.sql`이 만드는 `accounts` · `account_sessions` ·
`password_reset_tokens`에 따로 저장됩니다.

---

## 검사

```bash
npx tsc --noEmit        # 타입 검사
npm run lint            # ESLint
npm run build           # 프로덕션 빌드

cd backend && ./gradlew test    # 211개 (Docker 필요 — Testcontainers)
```

`backend/`의 통합 테스트는 Testcontainers로 실제 PostgreSQL 16을 띄웁니다. Docker가 없으면 해당
28개는 **조용히 skip**되므로, DB·Flyway·로그인 흐름을 검증하려면 Docker를 먼저 실행하세요.

CI(`.github/workflows/ci.yml`)가 push와 PR마다 위 검사를 모두 돌립니다.

---

## 기여

`master`에 직접 push하지 말고 브랜치를 만들어 PR을 올려주세요.

```bash
git switch -c feat/무엇을-바꾸는지
```

- 커밋 메시지는 [Conventional Commits](https://www.conventionalcommits.org/ko/) 형식을 씁니다
  (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- 커밋 전에 `git config user.email`이 GitHub 계정에 등록된 주소인지 확인하세요.
- 비밀값은 `.env*` / `.dev.vars` 에만 두고, 템플릿(`*.example`)에는 예시 값만 넣습니다.
- CI가 통과해야 병합할 수 있습니다.
