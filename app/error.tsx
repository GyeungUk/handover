'use client';

import { useEffect } from 'react';

/**
 * What the reader sees when a screen throws.
 *
 * Without this file React unmounts the tree and hands the browser an empty document — in production
 * with no message at all, so the reader is left on a white page with no idea whether their work was
 * saved, and no way forward but the back button. An office tool cannot fail like that.
 *
 * There are two ways out and both are offered, because they fix different things: `reset()` re-runs
 * the render that threw, which is enough for anything transient, and a reload is what recovers from
 * client state that has genuinely gone wrong. The message says what is true — the work is on the
 * server, not in this page — because "다시 시도" is a much easier button to press once you know
 * pressing it cannot lose anything.
 *
 * `digest` is the id the server logs the real stack under; a reader who reports the problem can
 * quote it, and it is the only part of an error that is safe to show.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    /* The overlay only exists in development; in production this is the one record on the client. */
    console.error('[workspace] 화면을 그리는 중 오류가 발생했습니다.', error);
  }, [error]);

  return (
    <main className="fault">
      <div className="fault-card">
        <span className="fault-mark" aria-hidden="true">!</span>
        <h1>화면을 불러오지 못했습니다</h1>
        <p>
          일시적인 오류로 이 화면을 표시하지 못했습니다. 다시 시도해 주세요.
          저장이 완료된 내용은 다시 불러올 수 있습니다.
        </p>
        <div className="fault-actions">
          <button type="button" className="ui-btn primary" onClick={reset}>다시 시도</button>
          <button type="button" className="ui-btn outline" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
        {error.digest && <p className="fault-code">오류 코드 <code>{error.digest}</code></p>}
      </div>
    </main>
  );
}
