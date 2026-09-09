# Overleaf 프로젝트별 논문 정책 템플릿

이 파일을 각 논문 저장소 root에 복사하고 대괄호 항목을 채운다. 파일명 예:
`OVERLEAF_PROJECT_POLICY_<PROJECT_ID>_<VENUE_YEAR>.md`.

## 1. 프로젝트 식별

- 논문명: `[PAPER_NAME]`
- venue/year/track: `[VENUE_YEAR_TRACK]`
- 담당자: `[OWNER]`
- Overleaf project ID: `[24_HEX_ID]`
- main document: `[MAIN.tex]`
- 정책 채택일: `[YYYY-MM-DD, TIMEZONE]`
- 정책 SHA-256: 채운 뒤 계산해 별도 manifest에 기록
- bridge integrity error code: `[venue_year_template_integrity_violation]`

공유 링크 token, 로그인 cookie, bridge token은 이 파일에 기록하지 않는다.

## 2. 허용 범위

- 수정 가능한 저자 콘텐츠 파일: `[PATHS_OR_PATTERNS]`
- 생성 가능한 그림·표·참고문헌 파일: `[PATHS_OR_PATTERNS]`
- 정확히 허용할 preamble 외부 모듈 선언: `[NONE 또는 한 줄 선언 목록]`
- 저자 소유 모듈 경로: `[NONE 또는 template과 겹치지 않는 경로]`
- 사람 확인이 필요한 항목: `[AUTHORS / FUNDING / ETHICS / REFERENCES / ...]`

## 3. 변경 금지 범위

- 원본 template support 파일: `[실제 경로별 .cls, .sty, .bst, ...]`
- main document의 보호 구조: `[documentclass, packages, margins, columns,
  fonts, title scaffold, bibliography style, headers/footers, ...]`
- 금지된 우회: 음수 여백, 글꼴 축소, 줄간격 압축, 페이지 제한 회피,
  다른 venue/year template으로 교체

모호한 diff는 바로 적용하지 않고 다시 읽고 preview한다. 일반 쓰기 승인 문구만으로
금지 범위를 우회하지 못하지만, 프로젝트 소유자가 정확한 변경과 결과를 확인한 뒤
같은 예외를 다시 명시적으로 승인하면 해당 범위에 한해 최신 사용자 결정을 따른다.
그 경우 예외와 규격 검증 상태를 기록한다.

외부 패키지는 자동으로 template 변경으로 분류하지 않는다. exact
`allowed_preamble_directives`에 등록되고 별도 외부 모듈 승인 문구를 받은 선언만
허용한다. 패키지명이나 옵션이 달라지면 새 정책 revision과 재승인이 필요하다.
모든 `*.sty`를 포괄 glob으로 보호하면 새 저자 모듈까지 막히므로, 원본 template
support 파일은 가능한 한 실제 경로/hash로 지정한다.

## 4. 공식 규칙 출처

- 공식 paper kit/template: `[URL]`
- submission instructions: `[URL]`
- mutable deadline/policy 최종 확인일: `[YYYY-MM-DD, TIMEZONE]`
- 페이지·익명성·저자·윤리·PDF 규칙 요약: `[RULES]`

## 5. 프로젝트 연결 시 자동으로 고정할 증거

- 전체 source ZIP SHA-256: `[HASH]`
- 보호 파일별 SHA-256 manifest: `[PATH]`
- main document 보호 구조 fingerprint: `[HASH_OR_MANIFEST]`
- main document 설정 확인: `[YES/NO + DATE]`
- 선택적 설치 TEST smoke receipt: `[RECEIPT_ID / NOT_RUN]`
- compile/PDF 검사 기록: `[PATH_OR_ID]`
- Overleaf History label 또는 별도 복제본: `[LABEL_OR_PROJECT]`

현재 도구가 이 증거를 실제로 생성·검사하지 못하면 완료로 표시하지 않는다.

### 5.1 bridge registry 입력 매핑

채운 정책을 검토한 뒤 Codex가 다음 값을 `overleaf_connect_project`에 전달한다.
기준선은 깨끗한 template 상태의 새 전체 Overleaf source ZIP에서 캡처한다.

| MCP 필드 | 이 정책에서 가져올 값 |
|---|---|
| `scope` | 실제 원고 정책은 내부적으로 `production` |
| `project_id` | 원고의 24자리 project ID |
| `policy_name` | 논문명 + venue/year + template lock |
| `policy_revision` | 정책 채택일 또는 내부 revision |
| `policy_source_sha256` | 채운 이 파일의 SHA-256 |
| `main_document` | 실제 main document 경로 |
| `editable_path_patterns` | 2절의 수정 가능한 text 경로 |
| `protected_paths` | 실제 존재하는 원본 template support 파일 |
| `protected_path_patterns` | 필요한 template 전용 pattern만 지정; 기본값은 빈 목록 |
| `mutable_preamble_commands` | template 안에서 내용만 바꿀 author field 명령 |
| `allowed_preamble_directives` | 사용자가 검토한 정확한 한 줄 package 선언; 기본 빈 목록 |
| `integrity_error_code` | 1절의 프로젝트별 hard rejection code |

사용자가 `이 프로젝트 연결해`라고 요청하면 Codex가 연결 확인을 기록하고 이 입력을
자동으로 전달한다. 별도 활성화 명령은 없다. 연결 결과의
`policyHash`, `definitionHash`, `mainStructureFingerprint`,
`protectedPathSetSha256`, 보호 파일 수를 이 저장소의 비공개 기록에 남긴다.

`allowed_preamble_directives`가 비어 있지 않으면, exact diff와 패키지·옵션·컴파일러
영향을 먼저 보여준 뒤 사용자가 추가로
`확인, Overleaf 외부 모듈 정책을 등록해줘`라고 승인해야 한다. 실제 문서에 선언을
추가하는 단계에서는 scope별 쓰기 승인도 별도로 다시 받는다.

선택적 TEST 프로젝트를 사용한다면 사용자·Mac 환경당 하나를 재사용하며 이
논문 정책에 포함하지 않는다. 이 학회 template 자체를 별도로 시험할 때만 template
복제본에 `scope: test` 정책을 추가한다.

## 6. 매 변경의 필수 검사

1. 정확한 project ID와 현재 서버 내용을 새로 읽는다.
2. 한 파일 exact diff와 before/after SHA-256을 제시한다.
3. 정책 hash와 보호 fingerprint가 preview 이후 바뀌지 않았는지 확인한다.
4. 사용자가 표시된 변경을 `반영해` 또는 `해봐`로 승인한 뒤에만 적용한다.
5. 적용 후 source ZIP hash, Track Changes, compile 결과를 확인한다.
6. venue별 페이지·overflow·참고문헌·저자·PDF 요건을 재검사한다.
7. receipt와 실패 결과를 모두 보존한다.

## 7. 복구

- receipt undo 범위: `[POLICY]`
- named checkpoint 구현 여부: `[IMPLEMENTED / NOT IMPLEMENTED]`
- 수동 History/복제 정책: `[POLICY]`
- 복원도 현재 상태와의 새 exact diff 및 새 승인을 요구한다.
