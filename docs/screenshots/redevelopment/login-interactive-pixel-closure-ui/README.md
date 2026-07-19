# UI-167 Login Interactive Pixel Closure

- 기준: `docs/oneflow-login-origin.png` (`1448x1086`)
- 실사: 인앱 Chromium `1280x720`, product panel `(192,24) 896x672`
- 정규화: 기준 이미지를 `896x672` Lanczos resize 후 RGB absolute difference
- 결과: full MAE `3.398`, story `2.291`, kanban `2.029`, auth `4.734`, card `6.056`, fields `6.054`, providers `9.416`
- `reference-runtime-diff-5x.png`: 기준 / 실제 기능형 화면 / 최대 채널 차이 5배 heatmap
- `desktop.png`, `mobile.png`: Playwright의 실제 runtime 캡처

전체 화면 screenshot overlay는 사용하지 않는다. 좌측 story와 OneFlow logo crop만 사용자 승인 원화에서 파생했고, 우측 인증 UI는 첫 페인트부터 실제 control이다.
