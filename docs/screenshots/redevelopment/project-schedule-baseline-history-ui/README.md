# UI-156 Project Schedule Baseline History

- `desktop.png`: Chromium 1280x720. Project Overview에서 이름 있는 기준선 2개를 저장한 뒤 과거 기준선을 선택해 현재 일정과의 지연·앞당김·일정 제거·신규 작업 차이를 비교한 상태다.
- `mobile.png`: Chromium 390x844. 최신 기준선 자동 선택, 1/20 이력 카운트, 삭제 action, 2열 요약과 빈 변동 상태가 수평 overflow 없이 유지되는 상태다.

두 캡처 모두 `apps/web/e2e/smoke.spec.ts`의 기능형 mock API를 사용하며 생성, 목록 갱신, 선택 상세 조회, 409 삭제 충돌 복구와 재삭제 성공을 같은 시나리오에서 검증한다.
