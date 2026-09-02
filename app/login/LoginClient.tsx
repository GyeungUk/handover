'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Card, Field, H2, Input, Select, Stack, Text } from '../ui';
import LoginShell from './LoginShell';
import { DeliveryNote, EmployeeIdField, Feedback, IdentifiedAs, NewPasswordFields, PasswordField, digitsOnly } from './fields';
import { seedTeams, type Team } from '../org-data';

/**
 * The sign-in screen: employee number and password, with password creation and
 * recovery behind one entry point.
 *
 * The recovery flow is deliberately one field deep. A person who does not know
 * their password also does not know whether they ever had one, so the screen
 * does not ask them to choose: they type their employee number,
 * `/api/auth/lookup` says which of the two situations they are in, and the
 * screen goes there. `identify` is that step; `register` and `reset` are its
 * two outcomes.
 */
type Step =
  | { kind: 'signin' }
  | { kind: 'identify' }
  | { kind: 'register'; employeeId: string }
  | { kind: 'onboarding' }
  | { kind: 'reset'; employeeId: string; maskedEmail: string }
  | { kind: 'reset-code'; employeeId: string; maskedEmail: string };

/** Every endpoint answers `{"error": "..."}` on failure, and the message is already written for the reader. */
async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도하거나 시스템 관리자에게 문의해 주세요.');
  }
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return payload;
}

/** The card every step renders into: a title, a lead line, then the form. */
function StepCard({ title, lead, onSubmit, children }: { title: string; lead: string; onSubmit: (event: FormEvent) => void; children: ReactNode }) {
  return (
    <Card tone="raised" pad="none" xl className="auth-card">
      <form onSubmit={onSubmit}>
        <div className="auth-card-head">
          <H2>{title}</H2>
          <Text size="sm" tone="muted">{lead}</Text>
        </div>
        <Stack gap="lg" className="auth-card-body">{children}</Stack>
      </form>
    </Card>
  );
}

/** The links under the card — never the primary way out of a step. */
function SecondaryActions({ children }: { children: ReactNode }) {
  return <div className="auth-secondary">{children}</div>;
}

function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button className="auth-link" type="button" onClick={onClick}>{children}</button>;
}

export default function LoginClient({ configured }: { configured: boolean }) {
  const [step, setStep] = useState<Step>({ kind: 'signin' });
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [onboardingTeams, setOnboardingTeams] = useState<Team[]>(seedTeams);
  const [belongsToOffice, setBelongsToOffice] = useState<'yes' | 'no'>('yes');
  const [teamId, setTeamId] = useState(seedTeams[0]?.id ?? '');
  const [workRole, setWorkRole] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /* Only the employee number survives a step change; it is the one field every step shares. */
  function go(next: Step, message = '') {
    setPassword('');
    setConfirmation('');
    setCode('');
    setError('');
    setNotice(message);
    setStep(next);
  }

  function submit(action: () => Promise<void>) {
    return async (event: FormEvent) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        await action();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : '요청을 처리하지 못했습니다.');
      } finally {
        setBusy(false);
      }
    };
  }

  /* A fresh render is what picks the session up: the server decides what the browser sees next. */
  const enterWorkspace = () => window.location.replace('/');

  const signIn = submit(async () => {
    await post('/api/auth/login', { employeeId, password });
    enterWorkspace();
  });

  const identify = submit(async () => {
    const result = await post<{ status: 'register' | 'reset'; maskedEmail: string | null }>(
      '/api/auth/lookup',
      { employeeId },
    );
    if (result.status === 'register') go({ kind: 'register', employeeId });
    else go({ kind: 'reset', employeeId, maskedEmail: result.maskedEmail ?? '' });
  });

  const createPassword = submit(async () => {
    if (password !== confirmation) throw new Error('비밀번호가 서로 다릅니다.');
    await post('/api/auth/register', { employeeId, name, email, password });
    /* The account is now signed in, so this request can include administrator-created parts too.
       If it cannot be loaded, the four standard international-office parts are still available. */
    await fetch('/api/teams')
      .then(async (response) => response.ok ? response.json() as Promise<{ customTeams?: Team[] }> : null)
      .then((data) => {
        if (!data) return;
        const teams = [...seedTeams, ...(data.customTeams ?? [])];
        setOnboardingTeams(teams);
        setTeamId((current) => current || teams[0]?.id || '');
      })
      .catch(() => {});
    go({ kind: 'onboarding' });
  });

  const finishOnboarding = submit(async () => {
    if (belongsToOffice === 'yes') {
      if (!teamId) throw new Error('소속 파트를 선택해 주세요.');
      await post('/api/members/onboarding', { teamId, role: workRole });
    }
    enterWorkspace();
  });

  const sendCode = submit(async () => {
    const result = await post<{ maskedEmail: string }>('/api/auth/password/reset-request', { employeeId });
    go({ kind: 'reset-code', employeeId, maskedEmail: result.maskedEmail }, '인증번호를 보냈습니다.');
  });

  const resetPassword = submit(async () => {
    if (password !== confirmation) throw new Error('비밀번호가 서로 다릅니다.');
    await post('/api/auth/password/reset', { employeeId, code, password });
    enterWorkspace();
  });

  const backToSignIn = <TextLink onClick={() => go({ kind: 'signin' })}>로그인으로 돌아가기</TextLink>;

  if (!configured) {
    return (
      <LoginShell headline={<>잠깐,<br />설정이 하나 빠졌어요.</>} sub="로그인 서버가 연결되지 않아 인증을 처리할 수 없습니다.">
        <Card tone="raised" pad="none" xl className="auth-card">
          <div className="auth-card-head">
            <H2>백엔드가 설정되지 않았습니다</H2>
            <Text size="sm" tone="muted">
              로그인 서버 주소(<code>HANDOVER_API_TARGET</code>)가 비어 있습니다.
            </Text>
          </div>
          <Stack gap="lg" className="auth-card-body">
            <p className="auth-message error" role="alert">
              <code>.dev.vars</code>에 <code>HANDOVER_API_TARGET</code>을 넣고 개발 서버를 다시 시작해 주세요.
            </p>
          </Stack>
        </Card>
      </LoginShell>
    );
  }

  return (
    <LoginShell
      headline={<>업무 일정과 인수인계를<br />한곳에서 관리하세요.</>}
      sub="국제처 구성원의 연간 업무를 확인하고 필요한 기록을 안전하게 이어갑니다."
      footnote="숫자 직번으로 비밀번호를 만들고 접속할 수 있습니다."
    >
      {step.kind === 'signin' && (
        <StepCard title="로그인" lead="직번과 비밀번호로 워크스페이스에 접속하세요." onSubmit={signIn}>
          <EmployeeIdField value={employeeId} onChange={setEmployeeId} autoFocus />
          <PasswordField label="비밀번호" value={password} onChange={setPassword} autoComplete="current-password" />
          <Feedback notice={notice} error={error} />
          <Button variant="primary" size="lg" type="submit" block busy={busy} busyLabel="확인하는 중" glyph="→">
            로그인
          </Button>
          <SecondaryActions>
            <TextLink onClick={() => go({ kind: 'identify' })}>비밀번호 찾기 및 만들기</TextLink>
          </SecondaryActions>
        </StepCard>
      )}

      {step.kind === 'identify' && (
        <StepCard title="비밀번호 찾기 및 만들기" lead="직번을 입력하면 새로 만들지, 찾을지 안내해 드립니다." onSubmit={identify}>
          <EmployeeIdField value={employeeId} onChange={setEmployeeId} autoFocus />
          <Feedback notice={notice} error={error} />
          <Button variant="primary" size="lg" type="submit" block busy={busy} busyLabel="확인하는 중" glyph="→">
            다음
          </Button>
          <SecondaryActions>{backToSignIn}</SecondaryActions>
        </StepCard>
      )}

      {step.kind === 'register' && (
        <StepCard title="비밀번호 만들기" lead="처음 접속하는 직번입니다. 사용할 비밀번호를 만들어 주세요." onSubmit={createPassword}>
          <IdentifiedAs employeeId={step.employeeId} />
          <Field label="이름">
            {(id) => <Input id={id} name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required autoFocus />}
          </Field>
          <Field label="이메일 주소" hint="비밀번호를 잊었을 때 인증번호를 받을 주소입니다.">
            {(id) => <Input id={id} name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" spellCheck={false} placeholder="예: name@ssu.ac.kr…" required />}
          </Field>
          <NewPasswordFields password={password} confirmation={confirmation} onPassword={setPassword} onConfirmation={setConfirmation} />
          <Feedback notice={notice} error={error} />
          <Button variant="primary" size="lg" type="submit" block busy={busy} busyLabel="만드는 중" glyph="→">
            비밀번호 만들고 시작하기
          </Button>
          <SecondaryActions>{backToSignIn}</SecondaryActions>
        </StepCard>
      )}

      {step.kind === 'onboarding' && (
        <StepCard title="소속 설정" lead="캘린더에 담당자로 표시할 소속과 업무를 알려 주세요." onSubmit={finishOnboarding}>
          <div className="auth-identified"><span>등록한 이름</span><b>{name}</b></div>
          <fieldset className="onboarding-choice">
            <legend>국제처 구성원이신가요?</legend>
            <label className={belongsToOffice === 'yes' ? 'selected' : ''}>
              <input type="radio" name="office-member" value="yes" checked={belongsToOffice === 'yes'} onChange={() => setBelongsToOffice('yes')} />
              <span><b>네, 국제처 구성원입니다</b><small>소속 파트의 연간 캘린더에 담당자로 추가됩니다.</small></span>
            </label>
            <label className={belongsToOffice === 'no' ? 'selected' : ''}>
              <input type="radio" name="office-member" value="no" checked={belongsToOffice === 'no'} onChange={() => setBelongsToOffice('no')} />
              <span><b>아니요</b><small>계정만 만들고, 캘린더에는 표시하지 않습니다.</small></span>
            </label>
          </fieldset>
          {belongsToOffice === 'yes' && <>
            <Field label="소속 파트" required>
              {(id) => <Select id={id} name="teamId" value={teamId} onChange={(event) => setTeamId(event.target.value)} required autoFocus>{onboardingTeams.map((team) => <option value={team.id} key={team.id}>{team.title}</option>)}</Select>}
            </Field>
            <Field label="담당 업무" required hint="예: 체류·비자 관리, 국제협정 · 의전">
              {(id) => <Input id={id} name="workRole" autoComplete="off" value={workRole} onChange={(event) => setWorkRole(event.target.value)} maxLength={80} placeholder="예: 체류·비자 관리…" required />}
            </Field>
          </>}
          <Feedback notice={notice} error={error} />
          <Button variant="primary" size="lg" type="submit" block busy={busy} busyLabel="저장하는 중" glyph="→">
            {belongsToOffice === 'yes' ? '캘린더에 추가하고 시작하기' : '시작하기'}
          </Button>
        </StepCard>
      )}

      {step.kind === 'reset' && (
        <StepCard title="비밀번호 찾기" lead="이미 비밀번호가 등록된 직번입니다. 등록된 이메일로 인증번호를 보냅니다." onSubmit={sendCode}>
          <IdentifiedAs employeeId={step.employeeId} />
          <DeliveryNote maskedEmail={step.maskedEmail} />
          <Feedback notice={notice} error={error} />
          <Button variant="primary" size="lg" type="submit" block busy={busy} busyLabel="보내는 중" glyph="→">
            인증번호 받기
          </Button>
          <SecondaryActions>{backToSignIn}</SecondaryActions>
        </StepCard>
      )}

      {step.kind === 'reset-code' && (
        <StepCard title="새 비밀번호 설정" lead={`${step.maskedEmail} 으로 보낸 인증번호를 입력해 주세요.`} onSubmit={resetPassword}>
          <IdentifiedAs employeeId={step.employeeId} />
          <Field label="인증번호">
            {(id) => (
              <Input
                id={id}
                name="verificationCode"
                className="auth-code"
                value={code}
                onChange={(event) => setCode(digitsOnly(event.target.value).slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                spellCheck={false}
                placeholder="예: 123456…"
                required
                autoFocus
              />
            )}
          </Field>
          <NewPasswordFields password={password} confirmation={confirmation} onPassword={setPassword} onConfirmation={setConfirmation} />
          <Feedback notice={notice} error={error} />
          <Button variant="primary" size="lg" type="submit" block busy={busy} busyLabel="변경하는 중" glyph="→">
            비밀번호 변경하고 시작하기
          </Button>
          <SecondaryActions>
            <TextLink onClick={() => go({ kind: 'reset', employeeId: step.employeeId, maskedEmail: step.maskedEmail })}>
              인증번호 다시 받기
            </TextLink>
            {backToSignIn}
          </SecondaryActions>
        </StepCard>
      )}
    </LoginShell>
  );
}
