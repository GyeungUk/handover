/**
 * What the browser shows while the server is still deciding who you are.
 *
 * `app/page.tsx` is `force-dynamic` and its first act is to ask the backend to identify the session
 * cookie. That is normally one fast hop — and it is not, the first time anybody opens the workspace
 * in a while: the backend sleeps when idle and takes over a minute to answer a request that wakes
 * it. Next streams nothing until the page's own render resolves, so without this file that minute
 * is a blank white document with a spinning tab, which every reader reads as "it is broken".
 *
 * So this is the first paint, and it says three things: the product's name, so the reader knows
 * they are in the right place; a bar that is moving, so they know something is; and, after a few
 * seconds, why it is taking this long. The line about the sleeping server only appears once the
 * wait has gone past what a working request takes — on a warm backend nobody ever sees it.
 *
 * It is a server component with no JavaScript of its own. The delayed line is a CSS animation, not
 * a timer, because a timer would need a client bundle to run a sentence.
 */
export default function Loading() {
  return (
    <main className="boot" aria-busy="true">
      <div className="boot-mark" aria-hidden="true">
        <span>SS</span><b>U</b>
      </div>
      <p className="boot-name">국제처 업무·인수인계</p>
      <div className="boot-bar" role="progressbar" aria-label="워크스페이스를 여는 중">
        <i />
      </div>
      <p className="boot-note">워크스페이스를 여는 중입니다…</p>
      {/*
        Shown from 6s. A request that is going to succeed quickly has long since finished by then,
        so a reader only ever reads this when it is true — and when it is, "up to a minute" is the
        one fact that turns a hang into a wait.
      */}
      <p className="boot-slow">
        서버가 절전 상태에서 깨어나는 중이면 최대 1분 정도 걸릴 수 있습니다.
      </p>
    </main>
  );
}
