# Codex–Overleaf 브리지 간편 설치·사용 가이드

일반 사용자가 기억할 흐름은 네 단계다.

> `install.command` 더블클릭 → Overleaf 열기 → `이 프로젝트 연결해` → 변경안 확인 후 `반영해`

`TEST`, `production`, 활성화 스위치, project ID 등록, fingerprint와 hash 관리는
브리지가 내부에서 처리한다.

## 1. 준비물

- macOS
- Google Chrome
- Node.js 20 이상
- Codex 앱 또는 CLI
- 배포 ZIP `codex-overleaf-bridge-kit-20260909-r7.zip`

## 2. 같은 Mac에서 설치

Codex와 Chrome을 같은 Mac에서 사용한다면 이것이 기본 방법이다.

1. ZIP을 받아 더블클릭해 푼다.
2. 생긴 폴더 안의 `install.command`를 더블클릭한다.
3. 자동으로 열린 Chrome에서 아래의 `Load unpacked` 절차를 마친다.

`install.command`가 더블클릭으로 열리지 않을 때만 터미널에서 다음 한 줄을
실행한다.

```bash
bash "$HOME/Downloads/codex-overleaf-bridge-kit-20260909-r7/install.command"
```

설치기는 내부 checksum을 먼저 검증한 뒤 확장 프로그램, Mac bridge, 자동 실행
항목과 Codex MCP 연결을 함께 설정한다. `npm ci`, build 명령, `sudo`, project ID와
TEST 프로젝트는 필요 없다. 함께 제공되는 `.zip.sha256`은 배포 관리자나 문제
진단 시 ZIP 자체까지 검증할 때만 사용하면 된다.

설치기가 Finder와 `chrome://extensions`를 연다. Chrome 보안상 다음 클릭만 직접
해야 한다.

1. `Developer mode`를 켠다.
2. `Load unpacked`를 누른다.
3. Finder에 열린 `approved-extension-v2.3.5` 폴더를 선택한다.
4. 이미 확장이 보이면 새로 추가하지 말고 `Reload`를 누른다.
5. Codex를 완전히 종료했다가 다시 연다.

설치는 논문과 무관하게 한 번만 한다.

## 3. 논문 연결

1. Chrome에서 수정할 Overleaf 프로젝트를 연다.
2. Codex에 다음처럼 말한다.

```text
이 Overleaf 프로젝트 연결해. 프로젝트 룰과 원본 템플릿은 보호해줘.
```

브리지는 자동으로 다음을 처리한다.

- 현재 project ID 확인
- main document와 프로젝트 파일 확인
- 새 Overleaf source ZIP 읽기
- 논문별 보호 정책과 template 기준선 등록
- 기준선 재검증
- 해당 프로젝트를 쓰기 준비 상태로 전환

별도의 `productionEnabled=true`나 활성화 명령은 없다. 연결이 검증되면 바로 사용할
수 있다. main document가 여러 개라 자동 판별할 수 없을 때만 Codex가 한 번 묻는다.

ICASSP처럼 논문 저장소에 프로젝트별 정책 파일이 있으면 Codex가 그 정책을 읽고
적용한다. 정책 파일이 없으면 연결 전에 허용할 본문 파일과 보호할 template 파일을
간단히 확인한다.

## 4. 평소 논문 수정

수정할 내용을 평소 말하듯 요청한다.

```text
Introduction 두 번째 문단을 더 간결하게 고쳐줘.
```

Codex가 현재 Overleaf 파일을 다시 읽고 변경안을 보여 준다. 내용과 범위가 맞으면
다음 중 하나로 승인한다.

```text
반영해
```

또는

```text
해봐
```

승인은 방금 본 변경안 한 건에만 적용된다. 브리지는 자동으로 Track Changes,
동시수정 충돌, 저장 결과, template 보호 상태와 compile 결과를 확인한다.

되돌릴 때는 변경 receipt를 지정해 다음처럼 요청한다.

```text
방금 변경 되돌려줘.
```

Overleaf에서 글자가 초록색으로 보이면 오류가 아니라 Reviewing/Track Changes
표시다. 검토가 끝난 변경만 Overleaf에서 Accept한다.

## 5. 위험할 수 있는 변경

일반 본문, 수식, 표, 캡션과 참고문헌 변경에는 추가 절차가 없다. 다음 변경만
Codex가 영향을 설명하고 한 번 더 확인한다.

- 원본 `.cls`, `.sty`, `.bst` 또는 template 구조 변경
- `\usepackage`나 외부 module 추가·option 변경
- compiler 변경
- geometry, 열 너비, 글꼴 크기, spacing 또는 페이지 구조 변경

Codex가 정확한 한 줄과 예상 영향을 보여 주면 사용자가 그 범위만 명확하게
재승인할 수 있다. 승인된 예외는 기록되며 다른 package나 option으로 확대되지
않는다.

## 6. 여러 논문 사용

논문마다 설치하거나 production 프로젝트를 전환할 필요가 없다.

1. 다른 Overleaf 논문을 연다.
2. 그 논문에서 `이 프로젝트 연결해`라고 한다.
3. 이후 평소처럼 수정한다.

각 논문의 정책과 기준선은 project ID별로 분리해 보관된다. 한 논문의 승인이나
template 예외는 다른 논문에 적용되지 않는다.

## 7. TEST 프로젝트

TEST 프로젝트는 필수가 아니다. 이미 중요한 원고에서 첫 쓰기·저장·undo를 별도로
연습하고 싶은 사람만 빈 프로젝트를 만들어 사용할 수 있다. 새 논문은 실제
프로젝트를 바로 연결하면 된다.

## 8. Codex가 연구 서버에 있을 때만 SSH 사용

Chrome은 Mac에 있고 Codex가 SSH 서버에서 실행될 때만 이 절이 필요하다. 먼저
Mac에서는 다음처럼 설치해 로컬 Codex MCP 자동 등록을 건너뛴다.

```bash
bash codex-overleaf-bridge-kit-20260909-r7/install.command --skip-codex-mcp
```

그다음 Mac의 MCP 어댑터와 token을 자신의 연구 서버 계정으로 복사하고 reverse
tunnel을 연다. 공유 서버에서는 사용자마다 서로 다른 remote port를 사용한다.

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

Codex를 다시 시작한 뒤 3절부터 동일하게 사용한다. bridge token 내용은 화면,
채팅, 메일 또는 Git에 붙여 넣지 않는다.

## 9. 자주 생기는 문제

| 증상 | 조치 |
|---|---|
| `Could not read package.json` | 예전 수동 설치 명령을 실행한 것이다. 새 ZIP의 `install.command`를 사용한다. |
| `Bootstrap failed: 5` | `sudo` 없이 `install.command`를 한 번 다시 실행한다. |
| 확장이 안 보임 | `chrome://extensions`에서 Developer mode, Load unpacked 또는 Reload를 확인한다. |
| Codex에 도구가 안 보임 | Codex를 완전히 다시 시작한다. 설치 출력의 `codexMcp` 상태를 확인한다. |
| heartbeat 없음 | 대상 Overleaf 탭과 확장을 Reload한다. Chrome profile을 확인한다. |
| `project_policy_not_registered` | 대상 탭에서 `이 프로젝트 연결해`를 다시 요청한다. |
| template integrity 오류 | 자동 적용하지 말고 Codex가 표시한 정확한 변경과 위험을 확인한다. |
| 초록색 글자 | Track Changes 표시다. 필요한 변경만 Accept한다. |

지원 요청에는 오류 메시지만 보내고 token, cookie, 공유 링크와 논문 원문은 보내지
않는다.

## 참고

- [OpenAI 공식 Codex MCP 문서](https://developers.openai.com/codex/mcp)
- [Overleaf Main document](https://docs.overleaf.com/getting-started/recompiling-your-project/the-main-document)
- [Overleaf Track Changes](https://docs.overleaf.com/collaborating/track-changes)
