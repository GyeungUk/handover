# 국제처 업무 인수인계 워크스페이스

대학 국제처의 연간 업무를 조직도·학사일정과 함께 관리하고, 담당자가 바뀔 때 인수인계서를
AI 초안으로 만들어 검토·승인까지 처리하는 사내 워크스페이스입니다.

- **프론트엔드** — Next.js 16 (RSC) · React 19 · Tailwind 4, Cloudflare Workers + D1에 배포
- **백엔드** — 두 가지 구현이 동시에 존재합니다.
  - `app/api/**` — Next.js Route Handlers + D1 (기본값)
  - `backend/` — Spring Boot 3.5 · Java 21 · PostgreSQL 16 · Flyway (교체용, 계약 동일)

두 백엔드는 요청 형식·응답 필드·HTTP 상태·오류 메시지가 같습니다. `.env.local` 한 줄로 왕복
전환할 수 있으며, 자세한 내용은 [`backend/README.md` §7](backend/README.md)에 있습니다.

---

## 빠른 시작

### 1. 프론트엔드 (Next.js + D1)

```bash
npm install

cp .dev.vars.example .dev.vars     # 접근 허용 계정과 OPENAI_API_KEY 를 채웁니다
npm run dev
```

`.dev.vars`를 채우지 않으면 **아무 계정도 로그인할 수 없습니다.** 허용 목록이 비어 있으면 접근을
거부하는 것이 기본 동작입니다. `OPENAI_API_KEY`가 없으면 AI 5개 엔드포인트만 503을 반환하고
나머지 기능은 정상 동작합니다.

### 2. 백엔드를 Spring으로 바꾸려면

```bash
cd backend
cp .env.example .env               # HANDOVER_ADMIN_EMAILS / MEMBER_EMAILS 를 채웁니다
docker compose up -d               # PostgreSQL 16
./run-local.sh                     # Flyway가 스키마를 만들고 8080에서 기동
```

```bash
# 프로젝트 루트에서
cp .env.local.example .env.local   # HANDOVER_API_TARGET=http://localhost:8080
npm run dev                        # /api/* 가 Spring 으로 전달됩니다
```

`.env.local`의 `HANDOVER_API_TARGET` 줄을 주석 처리하면 즉시 기존 D1 백엔드로 돌아갑니다.

---

## 설정

비밀값은 저장소에 넣지 않습니다. 템플릿을 복사해 채우는 방식이며, 실제 값이 담긴 파일은 전부
`.gitignore` 대상입니다.

| 템플릿 | 복사본 | 용도 |
| --- | --- | --- |
| `.dev.vars.example` | `.dev.vars` | Worker 환경변수 — 접근 허용 계정, OpenAI 키 |
| `.env.local.example` | `.env.local` | 개발 서버가 `/api/*` 를 보낼 백엔드 |
| `backend/.env.example` | `backend/.env` | Spring 백엔드 DB·인증·CORS·OpenAI |

접근 허용 목록은 양쪽 백엔드가 **같은 이름**(`HANDOVER_ADMIN_EMAILS`, `HANDOVER_MEMBER_EMAILS`)
으로 읽습니다. 쉼표로 구분하고 대소문자는 구분하지 않습니다. 계정을 추가할 때 코드를 고치거나
재배포할 필요가 없습니다.

---

## API

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

요청·응답 상세는 [`backend/docs/API-COMPATIBILITY.md`](backend/docs/API-COMPATIBILITY.md)를 보세요.

---

## 구조

```
├── app/                          Next.js App Router
│   ├── page.tsx                  로그인 · 접근 거부 · 워크스페이스 진입
│   ├── WorkspaceClient.tsx       조직도 · 연간 일정 · 팀원 관리
│   ├── HandoverWorkspace.tsx     인수인계 편집기 · 검토 · 승인
│   ├── org-data.ts               조직도와 연간 업무 (단일 원본)
│   ├── academic-calendar.ts      학사일정 (단일 원본)
│   ├── handover-schema.ts        인수인계 4개 섹션과 속성 정의 (단일 원본)
│   ├── authz.ts                  접근 허용 목록 판정
│   ├── chatgpt-auth.ts           ChatGPT 프록시 신원 헤더 해석
│   └── api/                      Route Handlers (D1 백엔드)
├── db/schema.ts                  D1 테이블 정의
├── drizzle/                      D1 마이그레이션
├── backend/                      Spring Boot 백엔드 (README 별도)
└── vite.config.ts                빌드 설정 + /api/* Spring 프록시
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

## 검사

```bash
npx tsc --noEmit        # 타입 검사
npm run lint            # ESLint
npm run build           # 프로덕션 빌드

cd backend && ./gradlew test    # 124개 (Docker 필요 — Testcontainers)
```

`backend/`의 통합 테스트는 Testcontainers로 실제 PostgreSQL 16을 띄웁니다. Docker가 없으면 해당
11개는 **조용히 skip**되므로, DB와 Flyway 계층을 검증하려면 Docker를 먼저 실행하세요.

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
