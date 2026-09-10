# Codex–Overleaf Bridge

Codex가 제안한 LaTeX 변경을 사용자가 확인한 뒤 Overleaf에 적용하도록 연결하는
비공개 배포 저장소입니다. 연구실, 연구팀 또는 개인 공동 작업에 사용할 수 있습니다.

> 로컬 구성: macOS, Google Chrome, Node.js 20 이상, Codex 앱 또는 CLI
>
> 원격 구성: 위 Mac 환경 + SSH 연구 서버의 Node.js 20 이상과 Codex CLI
>
> 현재 배포판: `20260909-r8` (upstream `2.3.5`, approved bridge revision `v6`)

## 가장 쉬운 설치: Codex에 맡기기

명령을 하나씩 직접 해석할 필요는 없습니다. 먼저 Mac의 `Downloads` 폴더에 아래
ZIP과 checksum 파일을 받은 뒤, Codex 앱 또는 설치하려는 연구 서버의 Codex CLI에
아래 요청문 **전체를 복사해 붙여 넣으세요**.

- [codex-overleaf-bridge-kit-20260909-r8.zip](release-assets/codex-overleaf-bridge-kit-20260909-r8.zip?raw=1)
- [codex-overleaf-bridge-kit-20260909-r8.zip.sha256](release-assets/codex-overleaf-bridge-kit-20260909-r8.zip.sha256)

```text
Codex–Overleaf Bridge 설치와 검증을 끝까지 진행해줘.

공식 저장소:
https://github.com/ianwonilkim/codex-overleaf-bridge

현재 배포판:
- codex-overleaf-bridge-kit-20260909-r8.zip
- SHA-256: cfa7a424360bbe7a22b084a357d75cb3eb587b0add4148a94f6494ee881bfbee
- Mac의 기본 다운로드 위치: ~/Downloads

먼저 현재 Codex가 (A) Chrome과 같은 Mac에서 실행 중인지, 아니면 (B) SSH 연구
서버에서 실행 중인지 uname, SSH_CONNECTION과 실행 환경으로 판별해. 확실하지
않을 때만 나에게 둘 중 하나를 물어봐.

공통 원칙:
1. 저장소에 접근할 수 있으면 README.md의 현재 설치 절차와 보안 원칙을 먼저 읽어.
   비공개 저장소라 읽을 수 없으면 이 요청문과 검증된 배포 ZIP만 사용하고 비공식
   사본을 검색하지 마.
2. ZIP과 .sha256을 확인하고 checksum이 맞을 때만 진행해. ZIP이 Mac에 없으면
   내가 다운로드해야 할 정확한 링크와 위치만 알려주고 기다려.
3. npm build, npm ci, sudo, 임의의 production/test 플래그를 사용하지 마.
4. 기존 프로젝트 정책, rollback checkpoint와 사용자 데이터를 삭제하지 마.
5. token의 값은 읽어서 출력하거나 채팅에 붙이지 말고 파일 자체만 다뤄.
6. bridge를 0.0.0.0 또는 공용 네트워크에 노출하지 마.
7. Overleaf 논문은 아직 수정하지 마. 이번 요청 범위는 설치와 읽기 연결 검증까지야.

A. 같은 Mac 구성이라면:
- 검증된 ZIP을 풀고 그 안의 install.command를 실행해.
- 설치 결과의 ok, extension.loadUnpackedPath, expectedId와 codexMcp 상태를 확인해.
- Chrome의 Developer mode → Load unpacked는 내가 직접 해야 하므로, 선택할 정확한
  폴더 경로를 보여주고 내가 “확장 로드했어”라고 할 때까지 기다려.
- 그 뒤 필요한 로컬 서비스와 MCP 등록을 비밀값 노출 없이 확인해.
- Codex 재시작이 필요하면 정확히 말하고, 재시작 후 내가 “설치 검증 계속해”라고
  하면 읽기 전용 heartbeat/연결 상태를 검증해.

B. SSH 연구 서버 구성이라면:
- 서버 단독 설치로 처리하지 마. Overleaf/Chrome/확장/bridge는 Mac에 있고,
  이 서버의 Codex CLI와 MCP adapter만 reverse SSH tunnel로 연결하는 구조야.
- 서버에서 Node.js 20 이상과 Codex CLI를 먼저 확인해.
- Mac에서 실행할 install.command --skip-codex-mcp, adapter/token scp, loopback 전용
  ssh -R 명령을 내 SSH 주소와 충돌 없는 REMOTE_PORT에 맞춰 한 블록으로 만들어줘.
- 내가 Mac 단계와 tunnel 실행을 완료했다고 할 때까지 기다린 뒤, 서버에 도착한
  adapter/token 파일의 존재와 권한을 확인하고 overleaf-approved MCP를 등록해.
- tunnel 터미널, Mac Chrome과 Overleaf 탭을 작업 중 계속 켜 둬야 한다고 알려줘.
- Codex CLI 재시작 후 내가 “설치 검증 계속해”라고 하면 읽기 전용
  heartbeat/연결 상태를 검증해.

자동으로 할 수 있는 안전한 설치·진단은 직접 실행하고, Chrome 클릭이나 반대편
Mac 명령처럼 내가 해야 하는 단계만 한 번에 하나씩 정확히 안내해. 설치 파일,
Mac bridge, Codex MCP 등록과 실제 읽기 연결을 구분해서 검증하고, 검증되지 않은
상태를 성공이라고 말하지 마. 오류가 나면 원인과 다음 한 단계만 간단히 알려줘.
```

Codex가 설치 중 멈추는 것은 대개 정상입니다. Chrome의 `Load unpacked`, Codex
재시작, 또는 Mac에서 SSH tunnel을 여는 단계는 사용자가 직접 해야 하기 때문입니다.
요청받은 동작을 마친 뒤 안내된 짧은 문장으로 같은 작업을 계속하면 됩니다.

## 수동 상세 매뉴얼

Codex에 맡기지 않고 직접 설치하거나, 각 단계가 무엇을 하는지 확인하려면 아래를
순서대로 따릅니다. 이 README만으로 로컬과 SSH 설치를 모두 마칠 수 있습니다.

### 1. 구성 선택

| Codex 실행 위치 | Chrome/Overleaf 위치 | 설치 방식 |
|---|---|---|
| 같은 Mac의 Codex 앱 또는 CLI | 같은 Mac | 로컬 설치 |
| SSH 연구 서버의 Codex CLI | 사용자 Mac | Mac bridge + reverse SSH tunnel |

연구 서버 구성은 완전한 서버 단독/headless 방식이 아닙니다.

```text
Mac:    Overleaf + Chrome 확장 + bridge(127.0.0.1:17381)
                                      ↑ SSH reverse tunnel
Server: Codex CLI + MCP adapter → 127.0.0.1:REMOTE_PORT
```

### 2. 다운로드와 검증

Mac의 `Downloads`에 ZIP과 `.sha256`을 받은 뒤 ZIP을 더블클릭해 풉니다. 원하면
압축을 풀기 전에 다음처럼 검증합니다.

```bash
cd "$HOME/Downloads"
shasum -a 256 -c codex-overleaf-bridge-kit-20260909-r8.zip.sha256
```

`OK`가 나와야 합니다. 현재 ZIP의 SHA-256은
`cfa7a424360bbe7a22b084a357d75cb3eb587b0add4148a94f6494ee881bfbee`입니다.

### 3. 같은 Mac에 설치

1. 압축을 푼 폴더의 `install.command`를 더블클릭합니다.
2. macOS가 막으면 파일을 우클릭하고 `Open`을 선택합니다.
3. 열린 Chrome에서 `Developer mode`를 켭니다.
4. `Load unpacked`를 누르고 Finder에 열린
   `~/.codex-overleaf/approved-extension-v2.3.5` 폴더를 선택합니다.
5. 같은 확장이 이미 있으면 다시 추가하지 말고 `Reload`를 누릅니다.
6. Codex를 완전히 종료했다가 다시 엽니다.

더블클릭으로 열리지 않을 때만 다음을 실행합니다.

```bash
bash "$HOME/Downloads/codex-overleaf-bridge-kit-20260909-r8/install.command"
```

설치기는 확장 프로그램, Mac bridge, 자동 실행 항목과 Codex MCP 연결을 사용자
계정 아래에 설정합니다. `npm`, `sudo`, project ID, TEST/production 설정은 필요
없습니다. 정상 확장 ID는 `illdpneeeopfffmiepaejglgmhpmdhdc`입니다.

### 4. SSH 연구 서버의 Codex CLI에 설치

Mac과 연구 서버 양쪽에서 `node --version`이 20 이상인지 확인합니다. 먼저 Mac에서
로컬 Codex MCP 등록만 생략해 설치합니다.

```bash
bash "$HOME/Downloads/codex-overleaf-bridge-kit-20260909-r8/install.command" \
  --skip-codex-mcp
```

Chrome에서 3절의 `Load unpacked`를 마친 다음 Mac 터미널에서 아래를 실행합니다.
`SSH_ALIAS`에는 `~/.ssh/config`의 별칭 또는 `사용자@서버주소`를 넣습니다. 공유
서버에서는 각 사용자가 겹치지 않는 `REMOTE_PORT`를 골라야 합니다.

```bash
SSH_ALIAS='사용자@연구서버'
REMOTE_PORT='17381'

ssh "$SSH_ALIAS" 'umask 077; mkdir -p "$HOME/.codex-overleaf/client" "$HOME/.codex"'
scp "$HOME/.codex-overleaf/approved-bridge-runtime-v1/approved-bridge/mcp-server.cjs" \
  "$SSH_ALIAS:~/.codex-overleaf/client/mcp-server.cjs"
scp "$HOME/.codex-overleaf/approved-bridge-v1/token" \
  "$SSH_ALIAS:~/.codex/overleaf-bridge-token"

ssh -NT -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -R "127.0.0.1:$REMOTE_PORT:127.0.0.1:17381" "$SSH_ALIAS"
```

마지막 `ssh -NT` 터미널은 작업하는 동안 열어 둡니다. 연구 서버의 다른 터미널에서
다음을 한 번 실행합니다. 위에서 다른 포트를 골랐다면 여기에도 같은 값을 씁니다.

```bash
REMOTE_PORT='17381'
codex mcp add overleaf-approved \
  --env "OVERLEAF_BRIDGE_URL=http://127.0.0.1:$REMOTE_PORT" \
  --env "OVERLEAF_BRIDGE_TOKEN_FILE=$HOME/.codex/overleaf-bridge-token" \
  -- "$(command -v node)" "$HOME/.codex-overleaf/client/mcp-server.cjs"
```

`codex mcp list`에서 `overleaf-approved`를 확인한 뒤 서버의 Codex CLI를 다시
시작합니다. 작업 중에는 Mac의 Chrome, 대상 Overleaf 탭, bridge와 SSH tunnel이
모두 켜져 있어야 합니다. tunnel은 서버의 `127.0.0.1`에만 열며 bridge를 공용
네트워크에 직접 노출하지 않습니다.

Codex 앱과 CLI의 MCP 등록 방식은
[OpenAI의 Codex MCP 문서](https://developers.openai.com/codex/mcp)에서도 확인할 수
있습니다.

### 5. 논문 연결과 평소 사용

Chrome에서 대상 Overleaf 프로젝트를 열고 Codex에 말합니다.

```text
이 Overleaf 프로젝트 연결해.
```

브리지는 현재 프로젝트와 main document를 확인하고, 새 source snapshot을 읽어
프로젝트별 보호 기준선을 만듭니다. 실제 논문을 바로 연결해도 됩니다. 별도의 TEST
프로젝트, production 플래그 또는 project ID 입력은 필요 없습니다. main document
후보가 여러 개일 때만 Codex가 선택을 묻습니다.

원하는 수정을 요청하면 Codex가 현재 원문과 적용할 diff를 먼저 보여 줍니다. 범위와
내용이 맞을 때만 다음처럼 승인합니다.

```text
반영해
```

승인은 방금 확인한 변경 한 건에만 적용됩니다. Overleaf에서 변경된 글자가
초록색이면 오류가 아니라 Reviewing/Track Changes 표시일 수 있습니다. 검토가 끝난
변경만 Overleaf에서 Accept합니다.

방금 반영한 변경은 `방금 변경 되돌려줘`라고 요청할 수 있습니다. 장기간 보관할
복원 지점은 변경 전에 다음처럼 요청하고, 실제 checkpoint ID와 hash가 반환됐는지
확인합니다.

```text
이걸 저장해놔. 이름은 submission-before-table-edit로 해줘.
```

### 6. 선택: 프로젝트별 학회·저널 규칙

일반 Overleaf 제어만 필요하면 아무 규칙도 추가하지 않습니다. 논문 규격까지
관리하고 싶은 프로젝트에서만 다음처럼 요청합니다.

```text
이 프로젝트는 [학회/저널] [연도] [track] 논문이야.
공식 저자 규정을 확인해서 핵심 규칙을 프로젝트별로 저장해줘.
```

규칙은 project ID별로 분리되며 페이지, 익명성, 필수 문구, 언어·용어,
ethics/funding, PDF와 제출 규칙 및 공식 출처 확인일을 담을 수 있습니다. 규칙이
없다는 이유로 일반 쓰기가 막히지 않으며, 나중에 추가·교체·삭제할 수 있습니다.
자세한 구분은 [프로젝트별 논문 규칙](docs/PROJECT_RULES_KO.md)을 참고하세요.

원본 `.cls`, `.sty`, `.bst`, compiler, geometry, 외부 package와 template 구조처럼
결과 형식에 영향을 줄 수 있는 변경은 Codex가 정확한 변경과 위험을 설명한 뒤 한 번
더 확인합니다. 외부 package가 무조건 금지되는 것은 아니며, 사용자가 표시된 범위를
재승인하면 그 예외만 기록해 적용할 수 있습니다.

### 7. 여러 논문과 업데이트

다른 논문은 그 Overleaf 탭을 열고 `이 프로젝트 연결해`라고 한 번 말하면 됩니다.
각 논문의 정책, 선택 규칙, template 기준선과 승인은 project ID별로 분리됩니다.

새 배포판은 기존 설치를 모두 지우지 않고 다음처럼 업데이트합니다.

1. 새 ZIP의 checksum을 확인하고 `install.command`를 실행합니다.
2. `chrome://extensions`에서 기존 확장의 `Reload`를 누릅니다.
3. Codex를 다시 시작합니다.

SSH 구성은 Mac에서 새 설치기를 `--skip-codex-mcp`로 실행한 뒤 새
`mcp-server.cjs`를 서버의 같은 위치에 다시 복사하고, tunnel과 Codex CLI를 다시
시작합니다. 포트와 MCP 설정이 같으면 매번 다시 등록할 필요는 없습니다. 기존
checkpoint나 프로젝트 상태 폴더를 삭제하지 마세요.

### 8. 문제 해결

| 증상 | 조치 |
|---|---|
| `Could not read package.json` | 예전 수동 build 명령입니다. Release ZIP의 `install.command`를 사용합니다. |
| `Bootstrap failed: 5` | `sudo` 없이 `install.command`를 한 번 다시 실행합니다. |
| 확장이 안 보임 | `chrome://extensions`에서 Developer mode와 Load unpacked/Reload를 확인합니다. |
| 확장 ID가 다름 | 설치기가 연 정확한 폴더를 다시 Load unpacked합니다. 정상 ID는 `illdpneeeopfffmiepaejglgmhpmdhdc`입니다. |
| Codex에 도구가 안 보임 | `codex mcp list`를 확인하고 Codex를 완전히 재시작합니다. |
| SSH의 `remote port forwarding failed` | 공유 서버에서 사용하지 않는 `REMOTE_PORT`를 골라 tunnel과 MCP 설정 양쪽에 똑같이 넣습니다. |
| 서버에서 heartbeat 없음 | Mac bridge, Chrome 확장, 대상 Overleaf 탭과 `ssh -NT` 터미널이 모두 살아 있는지 확인합니다. |
| 서버가 port forwarding을 금지함 | 연구 서버 관리자에게 사용자 loopback reverse forwarding 허용 여부를 문의합니다. bridge를 공용 주소로 우회 노출하지 않습니다. |
| project policy 오류 | 대상 탭에서 `이 프로젝트 연결해`를 다시 요청합니다. |
| template integrity 오류 | 자동 적용하지 말고 Codex가 표시한 정확한 변경과 위험을 확인합니다. |
| 초록색 글자 | Track Changes 표시입니다. 필요한 변경만 Accept합니다. |

지원 요청에는 macOS/Chrome/Node/Codex 버전과 오류 메시지만 보냅니다. token,
cookie, 비공개 Overleaf 링크, project ID, 사용자 경로와 논문 원문은 가립니다.

## 추천 사용법

가장 편한 방식은 ChatGPT 데스크톱 앱에서 Codex를 선택하고, 논문마다 프로젝트
하나와 `논문 작성 메인` 채팅 하나를 두는 것입니다. 실험, 문헌 조사, 그림과 검토는
별도 채팅으로 나누고, 관련 채팅의 링크와 짧은 요약을 메인 채팅에 남겨 전체 논문을
조율하게 합니다. Overleaf 연결과 실제 반영은 메인 채팅 하나에서 진행하는 것을
권장합니다.

채팅 링크나 고정만으로 모든 과거 대화가 자동으로 합쳐지지는 않습니다. 최종 결정과
채택한 결과는 메인 채팅 또는 프로젝트 문서에도 짧게 기록하세요. 서버 CLI에서도
같은 원칙을 적용할 수 있지만, 여러 채팅을 한눈에 관리하기에는 앱이 더 편합니다.

## 중요한 안전 원칙

- 적용 전에 Codex가 보여 주는 파일과 diff를 확인합니다.
- 원본 template, compiler, 외부 package 변경은 영향 설명과 별도 재확인을 거칩니다.
- Overleaf token, cookie, 비공개 링크, 논문 원문을 GitHub나 지원 채널에 올리지
  않습니다.
- 이 도구의 보호 기능은 학회 규정 준수를 대신 보증하지 않습니다. 최종 PDF와 제출
  규정은 저자가 직접 확인해야 합니다.

추가 자료는 [설치·사용 매뉴얼](docs/INSTALL_KO.md)과
[보안 안내](SECURITY.md)에서 볼 수 있습니다. 배포 담당자는
[비공개 GitHub 운영 매뉴얼](docs/GITHUB_PRIVATE_REPO_KO.md)을 참고하세요.

## 라이선스와 출처

이 배포판은 MIT 라이선스의
[`Ghqqqq/codex-overleaf-link`](https://github.com/Ghqqqq/codex-overleaf-link)
`2.3.5`를 기반으로 한 승인형 fork입니다. 자세한 출처는
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 기록했습니다.

이 프로젝트는 OpenAI 또는 Overleaf의 공식 제품이 아닙니다.
