# UI-202 Historical Activity Identity Avatars

- `desktop.png`: 저장된 activity/comment actor 이름과 event-scoped 이미지가 함께 보이는 작업 상세 drawer.
- `mobile.png`: 같은 이력과 avatar가 `390x844` viewport에서 가로 넘침 없이 유지되는 상태.

두 화면은 기능형 React DOM과 mock API image response를 사용하는 Playwright 캡처다. 불변 이름/이미지, 멤버십 회수, 계정 삭제와 storage 보존은 실제 PostgreSQL API 테스트로 별도 검증한다.
