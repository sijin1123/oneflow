# UI-215 Login Auth Pixel Parity Evidence

- 기준: `apps/web/src/assets/generated/oneflow-login-origin-reference.png`
- 데스크톱: `desktop-1448x1086.png`
- 인앱: `in-app-914x800.png`
- 모바일: `mobile-390x844.png`
- 계산: 동일 크기 RGB 채널별 mean absolute error
- 안정성: 글꼴 로드와 인증 설정 완료 후 두 프레임을 기다리며, 연속 2회 캡처 SHA-256이 동일함
- 상호작용: 비밀번호 보기/숨기기 버튼이 `EyeOff`와 `Eye`를 전환하고 실제 input `type`을 변경함

좌측 스토리와 로고는 승인 원본에서 생성한 래스터 파생물을 유지한다. 인증 폼은 스크린샷 오버레이가 아닌 실제 입력, 버튼, 링크, 인증 설정 상태를 보존한 채 폰트, 색, 테두리, 아이콘 치수를 보정했다.
