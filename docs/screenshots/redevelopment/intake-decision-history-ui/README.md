# UI-208 Intake Decision History Identity Avatars

- `desktop.png`: 지연 조회된 Intake 판정 이력의 실제 이미지 avatar, initials fallback, 이전/현재 상태, 판정 메모, 보류일과 시각을 표시한 desktop Chromium 캡처.
- `mobile.png`: 같은 기능 surface를 `390x844` viewport에서 가로 넘침 없이 검증한 mobile Chromium 캡처.

두 이미지는 mocked API를 사용하는 Playwright runtime 증적이다. E2E는 이력을 펼치기 전 요청이 없음을 확인하고, 펼친 뒤 actor image 요청 횟수와 decoded image width, transition/note/snooze date, 접기/다시 펼치기 cache와 horizontal overflow를 검사한다. 작성 시점 이름/이미지 불변성, triage-or-own-submission 가시성, exact project/item/event 결합, version 불일치 404와 storage 보존은 실제 PostgreSQL API 테스트로 별도 검증한다.
