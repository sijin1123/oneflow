# UI-306 Mobile Webhook Operations Lifecycle

- `retained-refresh-error-320.png`: endpoint와 delivery 후속 갱신이 함께 실패해도 마지막 성공 endpoint, delivery, summary와 독립 재시도를 유지하는 320x740 상태.
- `recovered-320.png`: endpoint 단독 복구 후 동일한 전체 두 요청을 재시도해 stale 안내를 모두 해소한 320x740 상태.

두 캡처는 실제 Webhook API route 계약, 관리자 shell, Quick Dock과 no-horizontal-overflow 검증을 사용한다. Secret 값은 캡처하거나 노출하지 않는다.
