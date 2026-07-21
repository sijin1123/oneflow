# UI-207 Project Health History Identity Avatars

- `desktop.png`: Project Overview 상태 이력의 실제 이미지 avatar, 탈퇴 사용자 fallback, 이전/현재 상태, 메모와 시각을 표시한 desktop Chromium 캡처.
- `mobile.png`: 같은 기능 surface를 `390x844` viewport에서 검증한 mobile Chromium 캡처.

두 이미지는 mocked API를 사용하는 Playwright runtime 증적이며, actor image 요청과 decoded image width, loading, history count, fallback, 상태 전환, note와 horizontal overflow를 함께 검사한다.
