# Overleaf 승인 브리지 계약

버전: 1.7.0
채택 범위: 2026-09-09 v5 간편 연결과 프로젝트별 자동 쓰기 준비
upstream: `Ghqqqq/codex-overleaf-link` v2.3.5, commit
`4cbaff3b99a05625c4cca48ea4fabd4bcffc5a7d`

## 1. 사용자 계약

일반 사용자는 `TEST`, `productionEnabled`, registry, fingerprint, hash를 직접
설정하지 않는다.

1. 브리지를 한 번 설치한다.
2. 대상 Overleaf 프로젝트를 열고 Codex에 `이 프로젝트 연결해`라고 요청한다.
3. 브리지가 새 source ZIP으로 프로젝트별 보호 기준선을 만들고 검증한다.
4. 검증이 성공하면 그 프로젝트는 즉시 쓰기 준비 상태가 된다. 별도 production
   활성화 단계는 없다.
5. Codex가 한 파일 변경안을 보여 주면 사용자가 `반영해` 또는 `해봐`라고
   승인한다.

연결과 쓰기 권한은 전역 스위치가 아니라 검증된 프로젝트 정책에 귀속된다. 여러
논문을 각각 연결해 둘 수 있고 한 프로젝트의 정책은 다른 프로젝트에 적용되지
않는다. 별도 TEST 프로젝트는 원하는 사용자만 쓰는 선택 사항이다.

## 2. 내부 안전 조건

다음 검사는 자동으로 수행하며 일반 사용자에게 명령으로 요구하지 않는다.

1. 주소의 `/project/<id>`에서 24자리 소문자 hex project ID를 확인한다.
2. 새 전체 Overleaf source ZIP에서 정책 기준선을 만든다.
3. 원본 template support 파일의 경로와 SHA-256, main document 구조 fingerprint를
   정책에 결합한다.
4. 현재 파일을 다시 읽어 한 파일 exact diff와 일회용 `approvalId`를 만든다.
5. 적용 직전 현재 내용과 승인된 before hash 및 patch 범위를 다시 비교한다.
6. Overleaf Reviewing/Track Changes가 켜졌는지 확인한다.
7. 적용 뒤 readback hash와 서버 저장 상태를 확인한다.
8. 보호 정책을 적용 전후에 다시 검증한 뒤 요청된 경우에만 compile한다.
9. 결과와 복구 증거를 receipt에 저장한다.
10. 확장이 쓰기 작업을 가져간 뒤 결과가 사라지면 자동 재시도하지 않고
    `unknown`으로 남긴다.

파일 생성·삭제·이름 변경·이동·바이너리 쓰기와 승인 없는 전체 파일 덮어쓰기는
이 승인 브리지의 기본 범위가 아니다.

## 3. 프로젝트 정책과 template 보호

논문별 정책은 다음을 포함한다.

- project ID와 main document
- 수정 가능한 파일 경로
- 보호할 원본 `.cls`, `.sty`, `.bst` 경로와 파일별 hash
- author content를 제외한 template 구조 fingerprint
- 검토한 정책 문서 SHA-256
- 허용한 외부 package 선언이 있으면 그 정확한 한 줄

일반 본문, 수식, 표, 그림 설명과 참고문헌 변경은 template 구조를 보존하면 정상
변경으로 처리한다. 원본 template 파일, geometry, 열 너비, 글꼴 크기, spacing,
page-number 또는 bibliography-style 변경은 자동으로 차단한다.

외부 LaTeX 모듈은 무조건 금지하지 않는다. Codex가 정확한 선언, 목적, compiler
영향과 format 위험을 보여 준 뒤 사용자가 그 예외를 다시 확인하면 해당 선언만
정책에 기록한다. package명이나 option이 달라지면 새 확인이 필요하다. 사용자가
영향을 확인하고 같은 범위를 명확히 재승인하면 그 좁은 예외를 따르되 검증되지
않은 결과를 학회 규격 준수라고 표시하지 않는다.

## 4. 승인 의미

- `이 프로젝트 연결해`: Overleaf 문서를 바꾸지 않고 현재 프로젝트의 보호
  기준선을 등록·검증한다.
- `반영해` 또는 `해봐`: 방금 표시된 한 파일 diff 한 건을 적용하고 저장·정책
  검증 및 선택된 compile을 실행한다.
- `되돌려줘`: 지정된 receipt의 검증 가능한 변경 한 건을 되돌린다.
- 외부 모듈이나 template 예외: 정확한 영향 설명 뒤 별도의 재확인이 필요하다.

긴 기존 승인 문구는 이전 설치와의 호환을 위해 계속 인식하지만 새 사용자에게
요구하지 않는다. 승인 ID는 30분 후 만료되고 한 번만 사용할 수 있다. diff나 현재
파일이 달라지면 새 미리보기와 승인이 필요하다.

## 5. 복구와 기록

- 성공 또는 쓰기 후 검증 실패에는 versioned receipt를 남긴다.
- receipt에는 대상 파일의 쓰기 전·후 hash와 필요한 복구 증거를 보관한다.
- Mac의 `~/.codex-overleaf/approved-bridge-v1`은 mode 0700, 내부 JSON과 token은
  mode 0600으로 보관한다.
- token, cookie와 공유 링크 token은 로그, 메신저 또는 Git에 올리지 않는다.
- 정책 재등록은 이전 기록을 덮어쓰지 않고 hash별 history를 남긴다.

사용자가 `이걸 저장해놔`라고 하면 이어지는 변경보다 먼저 명명된 rollback
checkpoint를 만들어야 한다. source ZIP, archive hash, 파일별 hash, project ID,
시각과 버전을 저장하고 checkpoint ID를 반환해야 완료다. 도구가 아직 이 기능을
지원하지 않으면 생성됐다고 가장하지 않고 변경 전에 멈춘다.

## 6. 연결 경계

- Mac daemon은 `127.0.0.1:17381`에만 bind한다.
- Codex와 Chrome이 같은 Mac에 있으면 SSH가 필요 없다.
- Codex가 연구 서버에서 실행될 때만 Mac이 시작한 SSH reverse tunnel을 사용한다.
- MCP 어댑터는 loopback URL만 허용한다.
- bridge token은 동일 사용자 loopback/tunnel 인증용이며 외부 API key가 아니다.

이 계약의 목적은 사용자가 내부 스위치를 관리하게 하는 것이 아니라 간단한 요청
뒤에 위험한 실수를 자동으로 막고 각 실제 변경의 최종 결정은 사용자에게 두는
것이다.
