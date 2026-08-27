import WorkspaceClient from './WorkspaceClient';
import { getAppRole } from './authz';
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

function LoginPage() {
  return <main className="login-page"><div className="login-brand"><span className="brand-mark"><i /><i /><i /></span><span><strong>국제처 업무 인수인계</strong><small>GLOBAL AFFAIRS WORKSPACE</small></span></div><section className="login-panel"><div className="login-visual"><span>2026</span><h1>업무의 흐름을<br />다음 사람에게.</h1><p>함께 만든 기록이<br />더 나은 내일의 시작이 됩니다.</p><div className="login-orbit"><i /><i /><i /></div></div><div className="login-form"><span className="modal-label">WELCOME BACK</span><h2>로그인</h2><p>허용된 교직원 계정으로 워크스페이스에 접속하세요.</p><div className="secure-login-note"><span>✓</span><p><b>안전한 계정 인증</b><small>비밀번호는 이 사이트에 저장되지 않습니다.</small></p></div><a className="login-button" href={chatGPTSignInPath('/')}>ChatGPT로 계속하기 <span>→</span></a><small className="mock-notice">관리자 및 등록된 팀원 계정만 접속할 수 있습니다.</small></div></section><footer><span>© 2026 GLOBAL AFFAIRS OFFICE</span><span>교직원 전용 시스템</span></footer></main>;
}

function AccessDenied({ email }: { email: string }) {
  return <main className="login-page"><div className="login-brand"><span className="brand-mark"><i /><i /><i /></span><span><strong>국제처 업무 인수인계</strong><small>GLOBAL AFFAIRS WORKSPACE</small></span></div><section className="access-denied-card"><span>ACCESS RESTRICTED</span><h1>등록되지 않은 계정입니다.</h1><p><b>{email}</b><br />관리자에게 팀원 계정 등록을 요청해 주세요.</p><a href={chatGPTSignOutPath('/')}>다른 계정으로 로그인</a></section><footer><span>© 2026 GLOBAL AFFAIRS OFFICE</span><span>교직원 전용 시스템</span></footer></main>;
}

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) return <LoginPage />;

  const role = getAppRole(user);
  if (!role) return <AccessDenied email={user.email} />;

  return <WorkspaceClient currentUser={{ displayName: user.displayName, email: user.email, role }} signOutHref={chatGPTSignOutPath('/')} />;
}
