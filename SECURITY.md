# Security

## 절대 저장소에 올리지 말 것

- `~/.codex-overleaf/approved-bridge-v1/token`의 내용 또는 복사본
- Chrome cookie, profile, session 파일
- 비공개 Overleaf 편집/공유 링크와 project ID
- 논문 source ZIP, PDF, figure, bibliography 또는 project-specific policy
- 개인 사용자 경로, SSH key, `.env`, API key와 인증 로그

지원 요청에는 민감한 값을 가린 오류 메시지만 첨부합니다. token이나 cookie가
노출되었다고 의심되면 더 공유하지 말고 배포 담당자에게 개인 채널로 알려 token을
교체합니다.

## 저장소 설정

- visibility는 `Private`로 유지합니다.
- 일반 사용자는 Read, 배포 담당자만 Write 권한을 사용합니다.
- Release asset은 같은 Private 저장소 안에서만 배포합니다.
- branch protection과 2단계 인증 사용을 권장합니다.

## 변경 적용

이 브리지는 사용자의 diff 승인과 template 보호를 돕지만, 논문 형식 준수나 내용의
정확성을 자동 보증하지 않습니다. 적용 후 Track Changes, compile 결과와 최종 PDF를
직접 확인합니다.
