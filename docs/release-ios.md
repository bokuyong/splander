# iOS 출시 안내 (App Store)

> **이름에 대한 법적 메모.** 「스플랜더」는 등록된 보드게임 상표와 한 글자 차이입니다.
> 이 이름으로 스토어에 올리면 상표권 침해 신고로 앱이 내려가거나 계정이 제재될 위험이
> 있다고 이미 안내드렸어요. **제출 전에 이름을 바꾸는 것을 권합니다.** 이름을 바꾸려면
> `capacitor.config.ts`의 `appName`, `ios/App/App/Info.plist`의 `CFBundleDisplayName`,
> `vite.config.ts`의 manifest, `index.html`의 `<title>`과 메타 태그, `src/data/`의 테마 문구를
> 함께 고치세요. (번들 ID `io.github.bokuyong.splander`도 App Store Connect에 한 번 등록하면
> 바꿀 수 없으니, 이름을 바꿀 거면 ID도 지금 같이 바꾸는 편이 좋습니다.)

> **솔직한 안내.** 이 저장소의 `ios/` 폴더는 Windows PC에서 `npx cap add ios`로 만들었고,
> 설정(표시 이름, 번들 ID, 세로 고정, 아이콘, 시작 화면)까지만 해 두었습니다. **iOS 앱은 Mac의
> Xcode에서만 빌드·서명·업로드할 수 있어서, 여기서는 빌드가 되는지 확인하지 못했습니다.**
> 아래 순서대로 Mac에서 처음 열 때 작은 수정이 필요할 수 있어요.

웹 앱(GitHub Pages)은 그대로 두고, 같은 `npm run build` 결과물(`dist/`)을
[Capacitor](https://capacitorjs.com)로 감싼 네이티브 앱입니다. iOS 프로젝트는 CocoaPods 대신
**Swift Package Manager**로 만들어져 있어서(`ios/App/CapApp-SPM/Package.swift`) 여는 파일은
`App.xcworkspace`가 아니라 **`ios/App/App.xcodeproj`** 입니다.

## 1. 준비물

| 항목 | 비고 |
|---|---|
| Mac (Apple Silicon 또는 Intel) | 빌려서라도 필요. 클라우드 Mac(MacStadium 등)도 가능 |
| Xcode 16 이상 | App Store에서 무료 설치, 디스크 30GB 이상 |
| Apple Developer Program | **연 US$99**. [developer.apple.com](https://developer.apple.com/programs/)에서 가입, 본인 확인에 1~2일 |
| Node.js 20 이상 | `brew install node` 또는 nodejs.org |
| 테스트용 iPhone | 시뮬레이터로도 화면은 보이지만 햅틱·실제 WebRTC 확인은 실기기 |

## 2. Mac에서 열기

```bash
git clone https://github.com/bokuyong/splander.git
cd splander
npm ci                 # 의존성 설치 (package-lock.json 기준)
npm run cap:sync       # 웹 빌드 + ios/App/App/public 에 복사 + Package.swift 갱신
npx cap open ios       # Xcode에서 ios/App/App.xcodeproj 열기
```

Xcode가 처음 열리면 Swift 패키지(Capacitor, 플러그인)를 받느라 1~2분 걸립니다.

## 3. Xcode에서 할 일

1. 왼쪽 트리에서 **App** 프로젝트 → **App** 타깃 → **Signing & Capabilities**
   - **Team**: 내 Apple Developer 팀 선택
   - **Automatically manage signing** 켜기
   - **Bundle Identifier**: `io.github.bokuyong.splander` (바꿀 거면 여기와
     `capacitor.config.ts`의 `appId`를 같이)
2. **General** 탭
   - Display Name: 스플랜더 (Info.plist의 `CFBundleDisplayName`)
   - Version(`MARKETING_VERSION`, 예: 1.0) / Build(`CURRENT_PROJECT_VERSION`, 올릴 때마다 +1)
   - Minimum Deployments: iOS 15.0 (Capacitor 8 기본값)
   - Device Orientation: Portrait만 체크되어 있어야 합니다 (iPad는 Portrait + Upside Down,
     `UIRequiresFullScreen`을 켜 두어서 iPad 멀티태스킹 요건을 피했어요)
   - **iPad 스크린샷을 준비하기 싫으면** Supported Destinations에서 iPad를 빼세요(iPhone 전용).
     그대로 두면 App Store Connect가 12.9인치 iPad 스크린샷도 요구합니다.
3. 상단에서 시뮬레이터(iPhone 15 등)나 연결한 iPhone을 고르고 **▶ Run**. 처음 실기기에 넣을 때는
   iPhone의 설정 → 일반 → VPN 및 기기 관리에서 개발자 앱을 신뢰해야 합니다.

### 확인할 것

- 검은 화면이 아니라 `#120F20` 배경 위에 홈 화면이 바로 나오는지 (시작 화면은
  `Base.lproj/LaunchScreen.storyboard`, 단색)
- 상태 표시줄 글자가 흰색인지 (`UIStatusBarStyle`, `@capacitor/status-bar` 설정 `style: DARK`)
- 화면이 위아래로 당겨지지(러버밴드) 않는지 (`capacitor.config.ts`의 `ios.scrollEnabled: false`,
  `contentInset: 'never'`)
- 내 차례가 되면 짧게 두 번 진동하는지 (`@capacitor/haptics`)
- 온라인 대전: iPhone 두 대 또는 iPhone + Android/웹. WKWebView의 WebRTC는 iOS 15 이상에서
  동작합니다. 안 되면 Xcode 콘솔의 로그를 확인하세요.

## 4. App Store Connect 등록

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **나의 앱** → **+** → 새로운 앱.
   플랫폼 iOS, 이름, 기본 언어 한국어, 번들 ID(Xcode에서 한 번 서명하면 목록에 나타남), SKU(아무
   고유 문자열).
2. **앱 정보**: 카테고리 게임 → 보드/카드, 콘텐츠 권한, **연령 등급** 설문(폭력·도박 없음 → 4+).
3. **앱 개인정보 보호**: "데이터를 수집하지 않음"으로 답할 수 있습니다(계정·광고·분석 없음, 게임
   상태는 기기 안에만 저장). 온라인 대전 때 상대와 공개 PeerJS 중계 서버에 IP가 드러난다는 점은
   개인정보처리방침에 적어 두세요. **개인정보처리방침 URL은 필수**이고, 지원 URL도 필요합니다
   (GitHub Pages 페이지나 저장소 README로 충분).
4. **스크린샷**: 6.7인치(iPhone 15 Pro Max 등, 1290×2796) 필수. 다른 크기는 자동으로 맞춰 줍니다.
   iPad를 지원하면 12.9인치(2048×2732)도 필수. 시뮬레이터에서 ⌘S로 찍으면 됩니다.
5. 설명, 키워드, 프로모션 텍스트, 지원 URL, 마케팅 URL(선택), 저작권.
6. **암호화**: Info.plist에 `ITSAppUsesNonExemptEncryption = NO`가 들어 있어서(HTTPS/WebRTC
   표준 암호화만 사용) 수출 규정 질문은 자동으로 넘어갑니다.

## 5. 업로드와 TestFlight

1. Xcode 상단 기기 선택을 **Any iOS Device (arm64)** 로 바꾸고 **Product → Archive**.
2. Organizer 창이 열리면 **Distribute App → App Store Connect → Upload**. 서명은 자동.
3. 10~30분 뒤 App Store Connect → **TestFlight** 탭에 빌드가 나타납니다. 처음 한 번은
   "수출 규정 준수" 확인이 뜰 수 있는데 "아니요(비면제 암호화 없음)"로 답하면 됩니다.
4. **내부 테스트**: 내 Apple ID(최대 100명)를 테스터로 추가 → iPhone에 TestFlight 앱을 설치하고
   초대를 받아 설치. 심사 없이 바로 됩니다. 외부 테스터(최대 10,000명)는 간단한 심사가 있어요.
5. 괜찮으면 **App Store** 탭 → 버전 → 빌드 선택 → **심사 제출**. 심사는 보통 1~3일.

### 심사에서 걸릴 수 있는 것

- **Guideline 4.2 (최소 기능)**: 웹사이트를 그냥 감싼 앱은 거절됩니다. 이 앱은 네트워크 없이도
  혼자 하기/같이 하기가 되고 햅틱 등 네이티브 기능을 쓰니 설명란에 그 점을 적어 두세요.
- **Guideline 5.2 (지식재산권)**: 위 법적 메모의 이름 문제. 규칙이 같은 유명 보드게임이라는 사실을
  설명·키워드·스크린샷 어디에도 쓰지 마세요.
- 심사용 메모에 "온라인 대전은 두 기기가 필요하며, 한 기기에서 방을 만들고 5글자 코드를 다른
  기기에서 입력한다"고 적어 두면 심사자가 헤매지 않습니다.

## 6. 업데이트

웹 코드를 고쳤다면 Mac에서 `npm run cap:sync` → Xcode에서 Build 번호를 올리고 → Archive →
Upload → 심사 제출. 네이티브 설정만 바꿨다면 `cap:sync` 없이 Archive만 하면 됩니다.

## 7. 설정된 것들 (참고)

- `ios/App/App/Info.plist`: 표시 이름 스플랜더, 세로 고정(iPhone: Portrait, iPad: Portrait +
  Upside Down + `UIRequiresFullScreen`), 다크 모드 고정(`UIUserInterfaceStyle = Dark`), 밝은 상태
  표시줄 글자, `ITSAppUsesNonExemptEncryption = NO`.
- `project.pbxproj`: 번들 ID `io.github.bokuyong.splander`, iOS 15.0 이상, iPhone + iPad.
- 아이콘: `Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024px, 불투명).
  `node scripts/make-icons.mjs`가 다시 만듭니다.
- 시작 화면: 템플릿의 Capacitor 로고 이미지를 지우고 `#120F20` 단색 뷰로 바꿨습니다.
- `ios/App/App/public`(dist 복사본), `capacitor.config.json`, `config.xml`은 git에 올라가지 않고
  `cap sync`가 만듭니다. `Package.swift`(`CapApp-SPM/`)는 플러그인 목록이라 git에 올라갑니다.
