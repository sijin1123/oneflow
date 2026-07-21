# UI-194 Login Pixel Exact Reinspection

승인 원본 `apps/web/src/assets/generated/oneflow-login-origin-reference.png`와 실제 Chromium 렌더링을 `1220x915` 제품 패널 좌표로 정규화해 비교한 증적이다.

- 승인 원본 SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`
- 데스크톱 viewport: `1448x1086`
- 실제 제품 패널 crop: `(114,86)-(1334,1001)`
- 전체 MAE: `1.4090`, 채널 delta `<=8`: `97.56%`, p95 delta: `3`
- 좌측 story MAE: `0.0149`, 채널 delta `<=8`: `99.95%`, p95 delta: `0`
- 로그인 영역 MAE: `3.0904`, 채널 delta `<=8`: `94.67%`, p95 delta: `10`
- 좌측 브랜드, 헤드라인, Kanban, 달력, 활동 카드와 로그인 로고 MAE: `0`

`side-by-side.png`은 승인 원본과 runtime panel을 나란히 배치하고, `diff-x8.png`은 절대 채널 차이를 8배 증폭한다. `desktop-1448x1086.png`, `in-app-953x917.png`, `mobile-390x844.png`은 실제 서비스 화면의 desktop, 인앱 크기와 mobile 회귀 증적이다. 세부 수치는 `pixel-metrics.json`에 보존한다.

## PR 기록

- **UI 변경**: 승인 원본에서 최종 정수 크기로 결정적으로 파생한 story와 logo 자산을 교체하고 desktop form의 1px 좌표, CTA, provider, 가입 행 정렬을 보정했다.
- **기능/API 반영**: semantic form, remember me, password visibility, 실제 sign-in/OIDC availability, policy dialog, 언어와 safe-next 계약은 유지한다. API, DB/schema, migration, permission, environment variable, dependency와 Settings UI 변경은 없다.
- **이연 항목**: 외부 OIDC 공급자의 실제 연결은 배포별 credential 경계를 유지한다. 이번 로그인 surface에는 mock, dead control 또는 장식용 버튼이 없다.
