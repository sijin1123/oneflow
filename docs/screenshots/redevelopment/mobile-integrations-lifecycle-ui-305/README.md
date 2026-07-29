# UI-305 Mobile Integrations Lifecycle Evidence

- `retained-refresh-error-320.png`: 320x740에서 Webhooks와 인증 재조회가 실패해도 마지막 성공 상태, endpoint 및 OIDC provider 사실을 유지하고 전체 재시도 명령을 제공한다.
- `recovered-320.png`: 동일한 네 API 전체 재시도 성공 후 stale 경고와 실패 수가 제거되고 실제 통합 상태가 복구된다.

두 화면 모두 current shell frame actions, 실제 관리 링크, Quick Dock 및 수평 overflow 부재를 Playwright로 확인했다. 비밀값이나 client-only provider 상태는 화면 또는 fixture 계약에 추가하지 않았다.
