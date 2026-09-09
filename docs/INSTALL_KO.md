# 설치·사용 매뉴얼

## 1. 준비물

- macOS
- Google Chrome
- Node.js 20 이상 (`node --version`으로 확인)
- Codex 앱 또는 CLI
- 저장소의 ZIP과 SHA256 파일

Codex와 Chrome이 같은 Mac에서 실행되면 SSH는 필요 없습니다.

## 2. 같은 Mac에서 설치

### 2.1 파일 받기

저장소 README의 다운로드 링크에서 아래 두 파일을 `Downloads`에 받습니다.

- `codex-overleaf-bridge-kit-20260909-r7.zip`
- `codex-overleaf-bridge-kit-20260909-r7.zip.sha256`

원하면 터미널에서 ZIP을 검증합니다.

```bash
cd "$HOME/Downloads"
shasum -a 256 -c codex-overleaf-bridge-kit-20260909-r7.zip.sha256
```

`OK`가 나와야 합니다. 현재 정상 ZIP의 SHA256은 다음과 같습니다.

```text
f8959ec5085f3d67cf25dc927089ff622217e49e5fcb2d1b1e3908e34a5b9907
```

### 2.2 설치 실행

1. ZIP을 더블클릭해 풉니다.
2. 생긴 폴더의 `install.command`를 더블클릭합니다.
3. macOS가 막으면 파일을 우클릭하고 `Open`을 선택합니다.

그래도 열리지 않을 때만 터미널에서 실행합니다.

```bash
bash "$HOME/Downloads/codex-overleaf-bridge-kit-20260909-r7/install.command"
```

설치기는 내부 checksum을 확인한 뒤 사용자 계정 아래에 확장 프로그램, Mac bridge,
자동 실행 항목과 Codex 연결을 설정합니다. `sudo`는 쓰지 않습니다.

### 2.3 Chrome 확장 연결

설치가 끝나면 Chrome 확장 페이지와 Finder가 열립니다.

1. Chrome의 `Developer mode`를 켭니다.
2. `Load unpacked`를 누릅니다.
3. Finder에 열린 `approved-extension-v2.3.5` 폴더를 선택합니다.
4. 같은 확장이 이미 보이면 새로 추가하지 말고 `Reload`를 누릅니다.
5. Codex를 완전히 종료했다가 다시 엽니다.

설치는 Mac 한 대에서 한 번만 하면 됩니다.

## 3. 논문 연결

1. Chrome에서 수정할 Overleaf 프로젝트를 엽니다.
2. Codex에 다음 문장을 보냅니다.

```text
이 Overleaf 프로젝트 연결해. 프로젝트 룰과 원본 템플릿은 보호해줘.
```

브리지는 현재 프로젝트와 main document를 확인하고, 새 source snapshot을 읽어
프로젝트별 보호 기준선을 만듭니다. 별도의 TEST 프로젝트, production 플래그 또는
project ID 입력은 필요 없습니다. main document 후보가 여러 개일 때만 Codex가
선택을 묻습니다.

새 논문이나 초기 원고라면 실제 프로젝트를 바로 연결해도 됩니다. TEST 프로젝트는
중요한 기존 원고에서 저장·undo를 먼저 연습하고 싶은 경우에만 선택적으로 씁니다.

### 3.1 추천: 논문 하나당 메인 채팅 하나

여러 작업을 함께 볼 때는 ChatGPT 데스크톱 앱의 Codex 모드가 가장 편합니다.

1. 논문마다 프로젝트 하나를 만듭니다.
2. `논문 작성 메인` 채팅을 하나 만들고 자주 쓸 수 있게 고정합니다.
3. 실험, 문헌 조사, 그림, 표와 검토는 목적별 별도 채팅으로 진행합니다.
4. 관련 채팅을 메인 Codex 채팅에 추가하거나, 채팅 링크와 2~3줄 요약을 메인
   채팅에 남겨 전체 논문 관점에서 정리하도록 합니다.
5. Overleaf 연결, 최종 문장 결정과 실제 반영은 메인 채팅 하나에서 진행합니다.

채팅 링크를 붙이거나 고정하는 것만으로 모든 과거 대화가 자동으로 메인 채팅의
문맥이 되지는 않습니다. 채택한 결과와 중요한 결정은 메인 채팅 또는 프로젝트의
정책·기록 문서에도 짧게 남깁니다. 서버 CLI에서도 같은 방식으로 역할을 나눌 수
있지만, CLI에는 앱의 프로젝트 보기가 없으므로 메인 세션을 정해 계속 이어 쓰는
편이 좋습니다.

## 4. 평소 사용

원하는 수정을 평소처럼 요청합니다.

```text
Introduction 두 번째 문단을 더 간결하게 고쳐줘.
```

Codex가 현재 원문을 다시 읽고 변경할 파일과 diff를 보여 줍니다. 범위와 내용이
맞으면 다음처럼 승인합니다.

```text
반영해
```

또는

```text
해봐
```

이 승인은 방금 확인한 변경 한 건에만 적용됩니다. 다른 변경이나 나중의 복원까지
자동 승인하지 않습니다.

Overleaf에서 변경된 글자가 초록색이면 Reviewing/Track Changes 표시입니다. 검토가
끝난 변경만 Overleaf에서 Accept합니다.

방금 반영한 변경을 되돌리려면 다음처럼 요청합니다.

```text
방금 변경 되돌려줘.
```

오래 보관할 복원 지점이 필요하면 변경 전에 다음처럼 요청합니다.

```text
이걸 저장해놔. 이름은 submission-before-table-edit로 해줘.
```

Codex가 checkpoint ID와 hash를 실제로 반환했는지 확인합니다. 문장만 말했다고
checkpoint가 만들어진 것은 아닙니다.

## 5. Template과 외부 package

본문, 수식, 표, 그림 캡션과 참고문헌의 일반 수정은 추가 설정 없이 진행합니다.
다음은 결과 형식에 영향을 줄 수 있으므로 Codex가 정확한 변경과 위험을 설명한 뒤
한 번 더 확인합니다.

- 원본 `.cls`, `.sty`, `.bst` 또는 template 구조 변경
- `\usepackage`나 외부 module 추가 또는 option 변경
- compiler 변경
- geometry, 열 너비, 글꼴 크기, spacing 또는 페이지 구조 변경

필요한 외부 package가 무조건 금지되는 것은 아닙니다. 사용자가 정확한 선언과
영향을 확인하고 같은 범위를 다시 승인하면 그 예외만 기록해 적용할 수 있습니다.

## 6. 여러 논문과 업데이트

다른 논문을 사용할 때는 그 Overleaf 탭을 열고 `이 프로젝트 연결해`라고 한 번
말합니다. 프로젝트별 정책, template 기준선과 승인은 서로 섞이지 않습니다.

새 배포판으로 업데이트할 때 기존 설치 전체를 지우지 않습니다.

1. 새 ZIP의 `install.command`를 실행합니다.
2. `chrome://extensions`에서 기존 확장의 `Reload`를 누릅니다.
3. Codex를 다시 시작합니다.

기존 Codex 연결이 아주 오래된 버전이라 새 도구가 보이지 않을 때만 다음을 한 번
실행한 뒤 설치기를 다시 실행합니다. 논문별 상태나 rollback checkpoint 폴더는
삭제하지 않습니다.

```bash
codex mcp remove overleaf-approved
bash "$HOME/Downloads/codex-overleaf-bridge-kit-20260909-r7/install.command"
```

## 7. Codex가 SSH 연구 서버에서 실행될 때만

Chrome은 Mac에 있고 Codex만 연구 서버에서 실행되는 경우입니다. 같은 Mac 사용자는
이 절을 건너뜁니다.

Mac에서 설치할 때 로컬 Codex 등록을 생략합니다.

```bash
bash codex-overleaf-bridge-kit-20260909-r7/install.command --skip-codex-mcp
```

그다음 Mac의 MCP 어댑터와 token을 자신의 연구 서버 계정으로 복사하고 reverse
tunnel을 엽니다. 공유 서버에서는 사용자마다 다른 remote port를 사용합니다.

Mac 터미널:

```bash
SSH_ALIAS='연구서버_alias'
REMOTE_PORT='17381'

ssh "$SSH_ALIAS" 'umask 077; mkdir -p "$HOME/.codex-overleaf/client" "$HOME/.codex"'
scp "$HOME/.codex-overleaf/approved-bridge-runtime-v1/approved-bridge/mcp-server.cjs" \
  "$SSH_ALIAS:~/.codex-overleaf/client/mcp-server.cjs"
scp "$HOME/.codex-overleaf/approved-bridge-v1/token" \
  "$SSH_ALIAS:~/.codex/overleaf-bridge-token"

ssh -NT -o ExitOnForwardFailure=yes \
  -R "127.0.0.1:$REMOTE_PORT:127.0.0.1:17381" "$SSH_ALIAS"
```

연구 서버의 다른 터미널:

```bash
REMOTE_PORT='17381'
codex mcp add overleaf-approved \
  --env "OVERLEAF_BRIDGE_URL=http://127.0.0.1:$REMOTE_PORT" \
  --env "OVERLEAF_BRIDGE_TOKEN_FILE=$HOME/.codex/overleaf-bridge-token" \
  -- "$(command -v node)" "$HOME/.codex-overleaf/client/mcp-server.cjs"
```

Codex를 다시 시작한 뒤 3절부터 동일하게 사용합니다. token 파일 내용은 화면,
채팅, 메일 또는 Git에 붙여 넣지 않습니다.

## 8. 문제 해결

| 증상 | 조치 |
|---|---|
| `Could not read package.json` | 예전 수동 build 명령입니다. Release ZIP의 `install.command`를 사용합니다. |
| `Bootstrap failed: 5` | `sudo` 없이 `install.command`를 한 번 다시 실행합니다. |
| 확장이 안 보임 | `chrome://extensions`에서 Developer mode와 Load unpacked/Reload를 확인합니다. |
| Codex에 도구가 안 보임 | Codex를 완전히 재시작합니다. 계속되면 6절의 MCP 재등록만 수행합니다. |
| heartbeat 없음 | 대상 Overleaf 탭과 확장을 Reload하고 Chrome profile을 확인합니다. |
| project policy 오류 | 대상 탭에서 `이 프로젝트 연결해`를 다시 요청합니다. |
| template integrity 오류 | 자동 적용하지 말고 Codex가 표시한 정확한 변경과 위험을 확인합니다. |
| 초록색 글자 | Track Changes 표시입니다. 필요한 변경만 Accept합니다. |

지원 요청에는 macOS/Chrome/Node/Codex 버전과 오류 메시지만 보냅니다. token,
cookie, 비공개 Overleaf 링크, project ID, 사용자 경로와 논문 원문은 가립니다.
