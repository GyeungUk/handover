# 보안 주의사항

## 1. 로그인은 이 서비스가 직접 처리합니다

직번과 비밀번호로 로그인하고, 성공하면 서버가 세션 쿠키를 내려 줍니다. 사용자 식별은 그 쿠키뿐이며,
요청에 실린 다른 어떤 헤더도 신원으로 쓰이지 않습니다.

- 비밀번호는 **PBKDF2-HMAC-SHA256**(계정마다 다른 salt, 210,000회)으로 저장합니다. 반복 횟수는 해시
  문자열 안에 들어 있어, 나중에 올려도 로그인할 때 자동으로 재해시됩니다(`PasswordHasher`).
- 세션 토큰은 256비트 난수이고 DB에는 **SHA-256 다이제스트만** 남습니다. `account_sessions` 테이블을
  통째로 읽어도 로그인에 쓸 수 없습니다.
- 쿠키는 `HttpOnly`, `SameSite=Lax`, `Path=/`입니다. HTTPS 배포에서는
  `HANDOVER_SESSION_COOKIE_SECURE=true`를 반드시 켜세요.
- 비밀번호가 바뀌면(재설정 포함) 그 계정의 **모든 세션이 폐기**됩니다.
- 로그인 실패는 직번당 15분에 10회로 제한합니다(`LoginThrottle`). 인스턴스 메모리에만 있으므로 여러 대를
  띄운다면 앞단에서 한 번 더 막으세요.

### 반드시 지켜야 할 배포 구조

```
브라우저 → 리버스 프록시 → ┬ /api/*  → Spring (8080)
                            └ 그 외    → Next.js
```

1. **백엔드를 공개 인터넷에 직접 노출하지 마세요.** 사설 네트워크, VPC, 또는 프록시만 접근 가능한
   방화벽 뒤에 두세요.
2. 프론트와 API가 **같은 오리진**이어야 세션 쿠키가 성립합니다.
3. 백엔드 포트를 로드밸런서/인그레스에서 프록시 외의 출발지로부터 차단하세요.

Nginx 예시:

```nginx
location /api/ {
    # 아래 2번의 공유 비밀을 쓰는 경우.
    proxy_set_header x-handover-gateway-secret $gateway_secret;

    proxy_pass http://handover-backend:8080;
}
```

## 2. 2차 방어선: 게이트웨이 공유 비밀 (선택, 권장)

프록시만 아는 비밀 헤더를 요구하면, 백엔드에 우연히 직접 도달한 요청은 아무것도 하지 못합니다.

```bash
HANDOVER_GATEWAY_SECRET=$(openssl rand -hex 32)
HANDOVER_GATEWAY_SECRET_HEADER=x-handover-gateway-secret
```

- 값이 비어 있으면(기본값) 도달 가능한 누구나 API를 호출할 수 있습니다. 세션이 없으면 읽지도 쓰지도
  못하지만, `/api/auth/*`는 열려 있습니다.
- 값이 설정되면 해당 헤더가 없는 요청은 **미인증**으로 처리되고, `/api/auth/*`는 403으로 거부됩니다.
  즉 계정 생성과 비밀번호 추측 시도 자체가 프록시 밖에서는 불가능해집니다.
- 비교는 `MessageDigest.isEqual`로 수행합니다.
- 프록시 역할을 하는 곳이 셋입니다: dev 서버(`.env.local`), Worker의 페이지 렌더(`.dev.vars`),
  그리고 운영 리버스 프록시. 셋 다 같은 값을 보내야 합니다.
- 이것은 네트워크 격리의 **대체재가 아니라 보완재**입니다. 1번을 먼저 지키세요.

## 3. 관리자 권한은 설정으로 관리합니다

로그인 화면에서 숫자 직번을 넣으면 누구나 비밀번호를 스스로 만들 수 있습니다. 관리자 권한만
환경변수 목록으로 부여합니다.

```bash
HANDOVER_ADMIN_EMPLOYEE_IDS=20180001
HANDOVER_MEMBER_EMPLOYEE_IDS=20190002,20190003
```

- 모든 숫자 직번은 조회·생성·로그인을 할 수 있고 일반 사용자 권한을 받습니다.
- 관리자 목록에 든 직번만 관리자입니다.
- `HANDOVER_MEMBER_EMPLOYEE_IDS`는 기존 설정 파일과의 호환을 위해 남아 있지만 가입 제한에는 쓰지
  않습니다.
- 공개 배포 시에는 가입을 원하는 모든 사람이 할 수 있으므로, 게이트웨이 비밀과 네트워크 접근 제어를
  반드시 유지하세요.

## 3-1. 비밀번호 찾기

등록된 이메일로 6자리 인증번호를 보냅니다.

- 인증번호는 DB에 다이제스트로만 남고, 유효기간은 기본 10분입니다.
- 코드 하나당 오입력 5회까지이며, 틀린 시도는 남아 있는 코드의 시도 횟수를 소모시킵니다.
- 계정당 시간당 5회까지만 요청할 수 있습니다(메일 폭탄 방지).
- 사용된 코드는 재사용되지 않고, 새 요청은 이전 코드를 무효화합니다.
- **SMTP가 설정되지 않으면 요청은 503으로 실패합니다.** 조용히 버리지 않습니다.
- `HANDOVER_PASSWORD_RESET_LOG_CODE=true`는 인증번호를 로그에 씁니다. **로컬 전용이며**, 메일 서버가
  함께 설정되어 있으면 기동 후 해당 요청이 실패하도록 되어 있습니다.

## 4. 비밀값 관리

| 값 | 전달 방법 | 저장소 커밋 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 환경변수 / 시크릿 매니저 | 금지 |
| `DATABASE_PASSWORD` | 환경변수 / 시크릿 매니저 | 금지 |
| `HANDOVER_GATEWAY_SECRET` | 환경변수 / 시크릿 매니저 | 금지 |
| `SMTP_PASSWORD` | 환경변수 / 시크릿 매니저 | 금지 |

- `backend/.gitignore`가 `.env`와 `src/main/resources/application-local.yml`을 제외합니다.
- 저장소에는 `.env.example`, `application-local.yml.example`만 있고 실제 값은 비어 있습니다.
- `application.yml`에는 기본값 자리표시자만 있고 실제 비밀은 없습니다.
- 기존 프로젝트의 `.dev.vars`에 실제 OpenAI 키가 들어 있습니다. 이 파일은 `.gitignore` 대상입니다.
- **키를 `backend/.env`로 복사하지 마세요.** `run-local.sh`가 `.dev.vars`에서 직접 읽으므로 로컬에는
  비밀값 사본이 하나만 존재합니다. 사본이 늘어날수록 실수로 커밋될 확률도 늘어납니다.
- 운영 배포에서는 `.dev.vars`가 없으므로 `OPENAI_API_KEY`를 환경변수나 시크릿 매니저로 주입하세요.

## 5. CORS

```bash
HANDOVER_CORS_ALLOWED_ORIGINS=https://handover.example.ac.kr
HANDOVER_CORS_ALLOW_CREDENTIALS=true
```

- 정확한 오리진만 나열합니다. 와일드카드 `*`는 자격증명과 함께 쓸 수 없습니다.
- 비워 두면 CORS 매핑 자체를 등록하지 않습니다(같은 오리진 배포에 적합하며, 이 편이 더 안전합니다).
- 프론트와 API를 같은 오리진 뒤에 두는 리버스 프록시 구성이 가장 안전합니다.

## 6. 모델 입력에 대한 프롬프트 인젝션

`import`, `quality`, `annual`, `calendar-check` 프롬프트에는 원문 안의 지시문을 따르지 말라는 문장이
포함되어 있고, 이는 TypeScript에서 그대로 옮겨왔습니다(`backend/tools/export-prompts.mjs`).
추가로 모델 출력은 항상 서버에서 검증됩니다.

- 본문 HTML은 `AiSupport.escapeHtml`로 이스케이프한 뒤 서버가 조립합니다. 모델이 만든 태그는 렌더링되지 않습니다.
- 인용문(`sourceQuote`, `quote`)은 실제 원문에 존재할 때만 유지됩니다.
- 학사일정 근거는 실제 발행된 행사명일 때만 인정되고, 이동 폭도 근거의 이동 폭과 일치해야 합니다.
- 속성값은 편집기가 정의한 key와 선택지에만 매칭될 때 살아남습니다.
