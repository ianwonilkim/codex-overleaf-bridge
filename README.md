# Codex–Overleaf Bridge

Codex가 제안한 LaTeX 변경을 사용자가 확인한 뒤 Overleaf에 적용하도록 연결하는
비공개 배포 저장소입니다. 연구실, 연구팀 또는 개인 공동 작업에 사용할 수 있습니다.

> 지원 환경: macOS, Google Chrome, Node.js 20 이상, Codex 앱 또는 CLI
>
> 현재 배포판: `20260909-r8` (upstream `2.3.5`, approved bridge revision `v6`)

## 5분 설치

1. 다음 두 파일을 받습니다.
   - [codex-overleaf-bridge-kit-20260909-r8.zip](release-assets/codex-overleaf-bridge-kit-20260909-r8.zip?raw=1)
   - [codex-overleaf-bridge-kit-20260909-r8.zip.sha256](release-assets/codex-overleaf-bridge-kit-20260909-r8.zip.sha256)
2. ZIP을 더블클릭해 풉니다.
3. 압축을 푼 폴더의 `install.command`를 더블클릭합니다.
4. 열린 Chrome에서 `Developer mode`를 켜고 `Load unpacked`를 누릅니다.
5. Finder에 함께 열린 `approved-extension-v2.3.5` 폴더를 선택합니다.
6. Codex를 완전히 종료했다가 다시 엽니다.

설치 후에는 대상 Overleaf 논문을 Chrome에서 열고 Codex에 다음처럼 말하면 됩니다.

```text
이 Overleaf 프로젝트 연결해.
```

학회·저널 규격까지 관리할 논문에서만 선택적으로 다음처럼 덧붙입니다.

```text
이 프로젝트는 [학회/저널] [연도] [track] 논문이야.
공식 규정을 확인해서 프로젝트 규칙으로 저장해줘.
```

수정을 요청하고 표시된 diff가 맞을 때만 다음처럼 승인합니다.

```text
반영해
```

일반 사용자는 build, `npm`, `sudo`, project ID, TEST/production 설정을 다룰 필요가
없습니다. 여러 논문은 각 논문 탭에서 한 번씩 연결하면 됩니다. 논문 규칙 프로필은
project ID별 선택 기능이므로 일반 Overleaf 제어 용도에는 넣지 않아도 됩니다.

## 추천 사용법

가장 편한 방식은 ChatGPT 데스크톱 앱에서 Codex를 선택하고, 논문마다 프로젝트
하나와 `논문 작성 메인` 채팅 하나를 두는 것입니다. 실험, 문헌 조사, 그림과 검토는
별도 채팅으로 나누고, 관련 채팅을 메인 채팅에 추가하거나 링크와 짧은 요약을 남겨
메인 채팅이 전체 논문을 조율하게 합니다. Overleaf 연결과 실제 반영은 메인 채팅
하나에서만 진행하는 것을 권장합니다.

채팅 링크나 고정은 정리 수단이며 모든 대화 내용을 자동으로 합치지는 않습니다.
최종 결정과 채택한 결과는 메인 채팅 또는 프로젝트 문서에도 짧게 기록하세요. CLI를
사용해도 같은 원칙을 적용할 수 있지만, 여러 채팅을 한눈에 관리하기에는 앱이 더
편합니다.

자세한 내용은 [설치·사용 매뉴얼](docs/INSTALL_KO.md)과
[프로젝트별 논문 규칙](docs/PROJECT_RULES_KO.md)을 참고하세요. 배포 담당자는
[비공개 GitHub 운영 매뉴얼](docs/GITHUB_PRIVATE_REPO_KO.md)을 먼저 읽어 주세요.
공유할 때는 [배포 공지문](docs/SHARING_NOTICE_KO.md)을 복사해 사용할 수 있습니다.

## 중요한 안전 원칙

- 적용 전에 Codex가 보여 주는 파일과 diff를 확인합니다.
- 원본 template, compiler, 외부 package 변경은 영향 설명과 별도 재확인을 거칩니다.
- Overleaf token, cookie, 비공개 링크, 논문 원문을 GitHub나 지원 채널에 올리지
  않습니다.
- 초록색 글자는 오류가 아니라 Overleaf Track Changes 표시일 수 있습니다.
- 이 도구의 보호 기능은 학회 규정 준수를 대신 보증하지 않습니다. 최종 PDF와
  제출 규정은 저자가 직접 확인해야 합니다.

보안상 주의사항은 [SECURITY.md](SECURITY.md)를 참고하세요.

## 라이선스와 출처

이 배포판은 MIT 라이선스의
[`Ghqqqq/codex-overleaf-link`](https://github.com/Ghqqqq/codex-overleaf-link)
`2.3.5`를 기반으로 한 승인형 fork입니다. 자세한 출처는
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 기록했습니다.

이 프로젝트는 OpenAI 또는 Overleaf의 공식 제품이 아닙니다.
