import LoginClient from './login/LoginClient';
import WorkspaceClient from './WorkspaceClient';
import { getSession } from './session';

export const dynamic = 'force-dynamic';

/**
 * The one gate into the workspace.
 *
 * Sign-in is the app's own now — employee number and password, held by the Spring backend — so this
 * render asks the backend who the browser is instead of reading identity headers a proxy set. There
 * is no separate "not registered" screen any more: an employee number on neither allow list is
 * refused at the login form itself, with a message the person can act on.
 */
export default async function Home() {
  const session = await getSession();

  if (session && 'error' in session) return <LoginClient configured={false} />;
  if (!session) return <LoginClient configured />;

  return <WorkspaceClient currentUser={session} />;
}
