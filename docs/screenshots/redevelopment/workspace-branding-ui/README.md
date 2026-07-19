# Workspace branding evidence

- `desktop.png`: 관리자 설정에서 로고 저장 후 topbar workspace switcher와 열린 workspace popover가 같은 로고를 표시하는 상태.
- `mobile.png`: `390x844` viewport에서 저장된 로고가 mobile header에 반영되고 문서 수평 overflow가 없는 상태.
- 두 캡처는 Playwright mock API가 실제 PUT/DELETE header, body, revision과 cache 반영 계약을 검증하는 동일 시나리오에서 생성한다.
- 실 PostgreSQL/API/Vite 스택에서도 업로드, shell/popover 반영, 삭제와 이름 기반 fallback 복귀를 별도로 확인했다.

Plane/OpenProject source, package, asset, CSS, DOM 또는 branding은 사용하지 않았다. 캡처의 2x2 PNG는 저장·반영 계약 검증만을 위한 OneFlow 테스트 fixture다.
