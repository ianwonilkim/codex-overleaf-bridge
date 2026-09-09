# 비공개 GitHub 배포·연결 매뉴얼

## 먼저 결정할 점

GitHub 저장소에는 “검색에는 나오지 않지만 링크를 아는 사람은 누구나 접근”하는
unlisted 모드가 없습니다. 이 도구에는 설치 코드와 운영 문서가 있으므로
다음 구성을 사용합니다.

- 저장소 visibility: `Private`
- 접근 방식: 사용할 사람의 GitHub username을 collaborator로 초대
- 설치 ZIP: 같은 Private 저장소의 versioned `release-assets` 파일
- GitHub Gist의 secret 링크나 공개 다운로드 링크는 사용하지 않음

Private 저장소 링크를 전달해도 초대되지 않은 사람은 열 수 없습니다.

## 1. Private 저장소 만들기

GitHub 웹에서 다음 순서로 만듭니다.

1. 우측 상단 `+` → `New repository`
2. Owner로 개인 계정 또는 사용할 organization 선택
3. Repository name: `codex-overleaf-bridge`
4. Visibility: 반드시 `Private`
5. `Create repository`

Organization을 쓰면 관리자에게 저장소 생성이나 앱 설치 승인이 필요할 수 있습니다.

## 2. Codex에 GitHub 연결

Codex 앱에서 GitHub plugin이 아직 연결되지 않았다면 다음을 수행합니다.

1. `Settings → Plugins`로 이동합니다. 화면 버전에 따라 sidebar의 `Plugins` 또는
   `Apps`로 표시될 수 있습니다.
2. `GitHub`를 선택하고 `Connect`를 누릅니다.
3. GitHub OAuth 화면에서 저장소를 만든 계정 또는 organization을 선택합니다.
4. GitHub가 저장소 범위를 물으면 `Only select repositories`를 선택합니다.
5. 목록에서 `codex-overleaf-bridge`를 선택합니다.
6. Organization 승인 화면이 나오면 관리자에게 해당 저장소만 승인 요청합니다.

연결 후 Codex에 다음처럼 알려 줍니다.

```text
GitHub 연결했어. 비공개 저장소 URL은 <owner/repo URL>이야.
준비된 README와 docs를 main에 올려줘.
```

GitHub 앱 설치와 특정 저장소 접근 허용은 별도 단계입니다. 연결은 되었는데 저장소가
안 보이면 GitHub의 `Settings → Applications → Installed GitHub Apps → Configure`에서
해당 저장소가 선택되었는지 확인합니다.

## 3. 사용자 초대

저장소에서 다음 순서로 초대합니다.

1. `Settings → Collaborators` 또는 `Collaborators and teams`
2. `Add people` 또는 `Add teams`
3. 사용할 사람의 GitHub username/팀 선택
4. 일반 사용자는 `Read`, 배포 담당자만 `Write` 이상 부여

각 사용자가 초대를 수락해야 저장소와 Release 파일에 접근할 수 있습니다. 더 이상
사용하지 않는 구성원은 collaborator/team에서 제거합니다.

## 4. 설치 ZIP 배포

현재 배포 ZIP과 checksum은 main branch의 `release-assets`에 함께 보관합니다.
Private 저장소 접근 권한이 있는 사용자만 다운로드할 수 있습니다.

원한다면 같은 파일을 GitHub Release에도 추가할 수 있습니다.

1. 저장소 오른쪽의 `Releases` → `Draft a new release`
2. 새 tag `v2026.09.09-r7` 생성
3. Release title: `Codex–Overleaf Bridge 20260909-r7`
4. 로컬 `release-assets` 폴더의 다음 두 파일을 첨부
   - `codex-overleaf-bridge-kit-20260909-r7.zip`
   - `codex-overleaf-bridge-kit-20260909-r7.zip.sha256`
5. `Set as the latest release`를 선택하고 Publish

Release도 저장소가 Private인 동안 초대된 사용자에게만 보입니다. Release를 만들지
않아도 README의 다운로드 링크를 바로 사용할 수 있습니다.

## 5. 버전 업데이트 원칙

- 이미 배포한 ZIP이나 tag를 덮어쓰지 않습니다.
- 새 build는 새 이름, 새 tag, 새 SHA256으로 올립니다.
- 이전 Release는 rollback과 재현을 위해 보존합니다.
- 새 버전 설치 전 최소 한 대에서 checksum, 새 설치, 기존 설치 upgrade, Chrome
  Reload와 Codex 재시작을 확인합니다.
- 저장소를 Public으로 바꾸기 전에는 token·논문·project policy 유출뿐 아니라
  bundled upstream code의 라이선스와 내부 문서까지 다시 검토합니다.

## 6. 공지 전 점검

- 저장소 상단에 `Private` 표시가 있는가
- 초대 대상과 권한이 맞는가
- Release tag와 ZIP 이름이 일치하는가
- SHA256 검증이 `OK`인가
- ZIP 안에 token, cookie, project ID, 사용자 경로, 논문 source가 없는가
- `README.md`의 Latest Release 링크가 열리는가

## 공식 참고

- [GitHub: 개인 저장소 collaborator 초대](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository)
- [GitHub: 저장소 visibility 관리](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [OpenAI Codex 문서](https://developers.openai.com/codex)
