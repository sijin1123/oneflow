# UI-201 Collaboration identity avatars

- `members-desktop.png`: Project Settings의 실제 멤버 디렉터리에서 업로드된 개인 이미지와 이름 기반 fallback이 같은 공통 avatar 계약으로 표시되는 Chromium `1440x900` 증적이다.
- `watchers-mobile.png`: 작업 상세 워처 요약과 참여자 popover가 프로젝트 범위 이미지와 fallback을 함께 표시하고 `390x844`에서 수평 overflow 없이 유지되는 증적이다.

프로필 이미지 URL은 공개 정적 경로가 아니라 현재 프로젝트 멤버만 읽을 수 있는 버전 고정 API다. 교차 사용자 응답은 `private, no-store`로 권한 변경마다 서버 검사를 거치며, 이미지 교체·삭제 시 멤버와 워처 query를 무효화하고 이전 버전 URL은 더 이상 읽히지 않는다.
