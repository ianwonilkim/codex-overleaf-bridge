# 배포 공지문

아래 내용을 복사하고 `<...>` 부분만 바꿔 공지합니다.

```text
[배포 안내] Codex–Overleaf 브리지

Codex가 제안한 논문 변경을 확인한 뒤 Overleaf Track Changes로 적용할 수 있는
브리지입니다.

비공개 저장소: <GitHub Private 저장소 URL>
설치 안내: 저장소 README.md
현재 버전: 20260909-r7

처음 사용할 때:
1) GitHub 초대 수락
2) README의 링크에서 ZIP과 .sha256 다운로드
3) ZIP을 풀고 install.command 더블클릭
4) Chrome에서 Developer mode → Load unpacked
5) Overleaf 논문을 열고 Codex에 “이 프로젝트 연결해”
6) 변경안을 확인한 뒤 “반영해”

TEST/production 선택, project ID 입력, npm build는 필요 없습니다. 같은 Mac에서
Codex와 Chrome을 쓰면 SSH도 필요 없습니다. Codex가 연구 서버에서 실행될 때만
매뉴얼의 SSH 절을 따르세요.

중요:
- diff를 확인하기 전에는 반영하지 마세요.
- token, cookie, 비공개 Overleaf 링크와 논문 원문을 GitHub/메신저에 올리지 마세요.
- template/compiler/외부 package 변경은 Codex의 영향 설명을 확인하고 다시 승인하세요.
- 초록색 글자는 보통 Overleaf Track Changes 표시입니다.

문의: <담당자 또는 채널>
```

## 지원 요청 양식

```text
- 설치 형태: 같은 Mac / SSH 연구 서버
- macOS 및 CPU:
- Chrome 버전:
- node --version:
- codex --version:
- 설치 출력의 ok / codexMcp / expectedId:
- 오류 메시지: <token, 사용자 경로, project ID와 논문 내용은 가림>
```
