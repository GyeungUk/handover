# 보안 주의사항

## 1. 인증 헤더는 "신뢰"됩니다 — 가장 중요한 배포 조건

이 백엔드는 요청에 실린 다음 헤더를 **그대로 믿고** 사용자를 식별합니다.

```
oai-authenticated-user-id
oai-authenticated-user-email
oai-authenticated-user-full-name
oai-authenticated-user-full-name-encoding
```

기존 Next.js 구현(`app/chatgpt-auth.ts`)도 정확히 같은 방식이었습니다. 즉 **이 서비스에 직접 접근할 수
있는 사람은 누구나 헤더를 넣어 관리자가 될 수 있습니다.**

```bash
# 서비스가 인터넷에 그대로 노출되면 이 한 줄로 관리자 권한이 뚫립니다.
curl -X POST https://api.example.com/api/members \
  -H 'oai-authenticated-user-id: whatever' \
  -H 'oai-authenticated-user-email: gyeunguk2062@gmail.com' \
  -H 'Content-Type: application/json' -d '{"personId":"minseo"}'
```

### 반드시 지켜야 할 배포 구조

```
브라우저 → ChatGPT 인증 프록시 → (신뢰 네트워크) → Spring 백엔드
```

1. **백엔드를 공개 인터넷에 직접 노출하지 마세요.** 사설 네트워크, VPC, 또는 프록시만 접근 가능한
   방화벽 뒤에 두세요.
2. **프록시가 들어오는 `oai-authenticated-user-*` 헤더를 반드시 제거(strip)한 뒤** 자신이 검증한 값으로
   다시 설정해야 합니다. 이 단계를 빠뜨리면 클라이언트가 보낸 헤더가 그대로 통과합니다.
3. 백엔드 포트를 로드밸런서/인그레스에서 프록시 외의 출발지로부터 차단하세요.

Nginx 예시:

```nginx
location /api/ {
    # 클라이언트가 보낸 신원 헤더를 먼저 지운다.
    proxy_set_header oai-authenticated-user-id            "";
    proxy_set_header oai-authenticated-user-email         "";
    proxy_set_header oai-authenticated-user-full-name     "";
    proxy_set_header oai-authenticated-user-full-name-encoding "";

    # 프록시가 검증한 값으로 다시 채운다.
    proxy_set_header oai-authenticated-user-id    $verified_user_id;
    proxy_set_header oai-authenticated-user-email $verified_user_email;

    # 아래 2번의 공유 비밀을 쓰는 경우.
    proxy_set_header x-handover-gateway-secret    $gateway_secret;

    proxy_pass http://handover-backend:8080;
}
```

## 2. 2차 방어선: 게이트웨이 공유 비밀 (선택, 권장)

프록시만 아는 비밀 헤더를 요구하면, 백엔드에 직접 도달한 요청의 위조 헤더는 무력화됩니다.

```bash
HANDOVER_GATEWAY_SECRET=$(openssl rand -hex 32)
HANDOVER_GATEWAY_SECRET_HEADER=x-handover-gateway-secret
```

- 값이 비어 있으면(기본값) 기존 Next.js와 동일하게 헤더만 믿습니다.
- 값이 설정되면 해당 헤더가 일치하지 않는 요청은 **미인증**으로 처리됩니다(401/403).
- 비교는 `MessageDigest.isEqual`로 수행합니다.
- 이것은 네트워크 격리의 **대체재가 아니라 보완재**입니다. 1번을 먼저 지키세요.

## 3. 권한 이메일은 설정으로 관리합니다

기존에는 `app/authz.ts`에 이메일이 하드코딩되어 있었습니다. 이제는 환경변수입니다.

```bash
HANDOVER_ADMIN_EMAILS=gyeunguk2062@gmail.com
HANDOVER_MEMBER_EMAILS=ruddnr2062@gmail.com,seongwhan0712@gmail.com,hyk@ssu.ac.kr
```

- 비교는 소문자로 정규화한 뒤 수행합니다.
- 관리자 목록이 회원 목록보다 우선합니다.
- 두 목록 모두 비어 있으면 **아무도 접근할 수 없습니다**(모든 요청 401). 배포 시 반드시 설정하세요.
- 기존 구현에는 `NODE_ENV !== 'production'`일 때 `seedy@sites.test`를 관리자로 인정하는 우회로가
  있었습니다. 이 백엔드에는 그런 코드 경로가 없습니다. 로컬에서 필요하면
  `application-local.yml`의 관리자 목록에 넣으세요. **운영 설정에는 절대 넣지 마세요.**

## 4. 비밀값 관리

| 값 | 전달 방법 | 저장소 커밋 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 환경변수 / 시크릿 매니저 | 금지 |
| `DATABASE_PASSWORD` | 환경변수 / 시크릿 매니저 | 금지 |
| `HANDOVER_GATEWAY_SECRET` | 환경변수 / 시크릿 매니저 | 금지 |

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
