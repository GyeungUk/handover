import { notFound } from 'next/navigation';
import PreviewClient from './PreviewClient';

/**
 * The workspace, rendered against seed data without a session.
 *
 * Design work needs every screen on demand at three viewport widths, and the
 * only way in was a password — which is a bad reason to hand a credential
 * around, and a worse one to seed a session row into the database. This route
 * skips the question: it mounts the same client component the signed-in page
 * mounts, with a stand-in account.
 *
 * A small in-memory API keeps the route deterministic while making its controls
 * genuinely interactive. Nothing from a preview is written to the real backend.
 *
 * Development only. In a production build the route does not exist.
 */
export const dynamic = 'force-dynamic';

const PREVIEW_USER = {
  employeeId: '00000000',
  displayName: '미리보기',
  email: 'preview@example.invalid',
  role: 'admin' as const,
};

export default function PreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PreviewClient currentUser={PREVIEW_USER} />;
}
