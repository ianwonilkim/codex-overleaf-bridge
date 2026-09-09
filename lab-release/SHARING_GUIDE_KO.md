# Codex–Overleaf 브리지 배포 안내

## 배포 방법

Private GitHub 저장소의 Release에 다음 두 파일을 함께 올린다. 일반 사용자는 ZIP만
받으면 되고, `.sha256`은 ZIP 자체를 검증할 때 쓴다.

- `codex-overleaf-bridge-kit-20260909-r7.zip`
- `codex-overleaf-bridge-kit-20260909-r7.zip.sha256`

새 배포본은 기존 파일이나 tag를 덮어쓰지 않는다. token, cookie, 비공개 Overleaf
링크와 논문 원문은 저장소나 지원 채널에 올리지 않는다.

## 복사해서 쓰는 안내문

```text
[배포 안내] Codex–Overleaf 브리지

Codex가 제안한 논문 변경을 확인한 뒤 Overleaf Track Changes로 적용할 수 있는
브리지입니다.

배포 위치: <Private GitHub 저장소 링크>
받을 파일:
- codex-overleaf-bridge-kit-20260909-r7.zip
- codex-overleaf-bridge-kit-20260909-r7.zip.sha256

설치 후 사용법은 네 단계입니다.
1) ZIP을 풀고 install.command 더블클릭
2) Overleaf 논문 열기
3) Codex에 “이 프로젝트 연결해”
4) 변경안이 맞으면 “반영해”

TEST/production 선택, project ID 입력과 별도 쓰기 활성화는 필요 없습니다.
여러 논문은 각 프로젝트에서 한 번씩 연결하면 됩니다. 같은 Mac에서 Codex와
Chrome을 쓰면 SSH도 필요 없습니다. Codex가 연구 서버에서 실행될 때만 포함된
가이드의 SSH 절을 추가하세요.

원본 학회 template은 자동으로 보호합니다. 외부 package나 template 변경은
영향을 확인한 뒤 사용자가 다시 승인할 수 있습니다.

README_FIRST_KO.md부터 따라 주세요.
문의: <담당자/채널>
```

## 지원 요청 양식

```text
- 설치 형태: 같은 Mac / SSH 연구 서버
- macOS 및 CPU:
- Chrome 버전:
- node --version:
- codex --version:
- 설치 출력의 ok / codexMcp / expectedId:
- 오류 메시지: <token, 사용자 경로, project ID는 가림>
```
