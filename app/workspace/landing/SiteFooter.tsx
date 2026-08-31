import { Container } from '../../ui';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <Container className="site-footer-inner">
        <div>
          <b>숭실대학교 국제처</b>
          <small>
            서울특별시 동작구 상도로 369
            <br />
            연간 일정과 업무 인수인계를 안전하게 관리합니다.
          </small>
        </div>
        <p>
          © 2026 GLOBAL AFFAIRS OFFICE
          <br />
          교직원 전용 시스템
        </p>
      </Container>
    </footer>
  );
}
