import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="fault">
      <div className="fault-card">
        <span className="fault-mark" aria-hidden="true">404</span>
        <h1>페이지를 찾을 수 없습니다</h1>
        <p>주소가 변경되었거나 없는 페이지입니다. 홈에서 필요한 업무를 다시 찾아보세요.</p>
        <div className="fault-actions">
          <Link href="/" className="ui-btn primary">홈으로 돌아가기</Link>
        </div>
      </div>
    </main>
  );
}
