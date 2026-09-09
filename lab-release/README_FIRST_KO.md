# 먼저 읽기: Codex–Overleaf 브리지

## 설치

같은 Mac에서 Codex와 Chrome을 사용하면 다음만 한다.

1. 받은 ZIP을 더블클릭해 푼다.
2. 생긴 폴더 안의 `install.command`를 더블클릭한다.
3. 자동으로 열린 Chrome에서 `Developer mode → Load unpacked`를 누른다.
4. Finder에 함께 열린 `approved-extension-v2.3.5` 폴더를 선택한다.
5. Codex를 완전히 종료했다가 다시 연다.

`install.command`가 더블클릭으로 열리지 않을 때만 터미널에서 다음 한 줄을
실행한다.

```bash
bash "$HOME/Downloads/codex-overleaf-bridge-kit-20260909-r7/install.command"
```

설치기가 포함된 내부 파일의 checksum을 자동으로 검사하므로 일반 사용자가 build,
`npm`, `sudo`, project ID 또는 설정 파일을 다룰 필요가 없다.

## 사용

1. 대상 Overleaf 논문을 연다.
2. Codex에 `이 프로젝트 연결해`라고 한다.
3. 수정 내용을 요청한다.
4. 표시된 변경이 맞으면 `반영해` 또는 `해봐`라고 한다.

끝이다. TEST, production 설정, project ID 입력, 활성화 명령은 필요 없다. 여러
논문은 각 논문을 열고 한 번씩 연결하면 된다.

외부 package, compiler 또는 template 구조를 바꿀 때만 Codex가 위험을 설명하고
한 번 더 확인한다. 초록색 글자는 오류가 아니라 Overleaf Track Changes다.

Codex가 연구 서버에서 실행될 때만
[전체 가이드](APPROVED_BRIDGE_SETUP_KO.md)의 SSH 절을 따른다. token, cookie,
공유 링크와 논문 원문은 지원 채널에 올리지 않는다.
