# Android 출시 안내 (Google Play)

> **이름에 대한 법적 메모.** 「스플랜더」는 등록된 보드게임 상표와 한 글자 차이입니다.
> 이 이름으로 스토어에 올리면 상표권 침해 신고로 앱이 내려가거나 계정이 제재될 위험이
> 있다고 이미 안내드렸어요. **제출 전에 이름을 바꾸는 것을 권합니다.** 이름을 바꾸려면
> `capacitor.config.ts`의 `appName`, `android/app/src/main/res/values/strings.xml`의
> `app_name`/`title_activity_main`, `vite.config.ts`의 manifest, `index.html`의 `<title>`과
> 메타 태그, 그리고 `src/data/`의 테마 문구를 함께 고치세요. (앱 ID `io.github.bokuyong.splander`도
> 한 번 올리면 바꿀 수 없으니, 이름을 바꿀 거면 ID도 지금 같이 바꾸는 편이 좋습니다.)

웹 앱(GitHub Pages)은 그대로 두고, 같은 `npm run build` 결과물(`dist/`)을
[Capacitor](https://capacitorjs.com)로 감싼 네이티브 앱입니다. `android/` 폴더가 Android
Studio 프로젝트이고, 설정은 `capacitor.config.ts` 한 파일에 있어요.

## 1. 준비물 (이 PC에 이미 있음)

| 항목 | 위치 / 값 |
|---|---|
| Node.js 24 | `node -v` |
| Android SDK | `C:\Users\bokuy\AppData\Local\Android\Sdk` (`ANDROID_HOME`) |
| JDK 21 | Android Studio에 들어 있는 JBR: `C:\Program Files\Android\Android Studio\jbr` |

Capacitor 8은 **JDK 21**이 필요합니다. 터미널의 기본 `java`는 17이라서, 빌드 전에 `JAVA_HOME`을
JBR로 맞춰 주세요. (매번 치기 귀찮으면 사용자 환경 변수 `JAVA_HOME`에 넣어 두면 됩니다.)

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

## 2. 디버그 APK 만들기 (내 폰에서 바로 써 보기)

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npm run android:debug
```

이 한 줄이 `npm run build` → `npx cap sync`(dist를 android/ios 프로젝트로 복사) →
`gradlew assembleDebug`를 차례로 합니다. 결과물:

```
android\app\build\outputs\apk\debug\app-debug.apk   (약 7.5 MB)
```

폰에 설치하려면 USB 디버깅을 켜고:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
```

에뮬레이터(Android Studio → Device Manager → Pixel_7)에서도 같은 명령으로 설치됩니다.
Android Studio에서 열어 보려면 `npx cap open android`.

단계를 따로 실행하고 싶을 때:

```powershell
npm run cap:sync                 # 웹 빌드 + 네이티브 프로젝트에 복사 (웹 코드를 고쳤으면 항상 먼저)
cd android
.\gradlew.bat assembleDebug      # 디버그 APK
.\gradlew.bat bundleRelease      # 릴리스 AAB (아래 서명 설정 뒤에)
```

### 버전 올리기

`android/app/build.gradle`의 `versionCode`(정수, 올릴 때마다 +1)와 `versionName`("1.0.1" 같은
표시용)을 고칩니다. Play는 같은 `versionCode`를 두 번 받지 않아요.

### 아이콘

런처 아이콘(adaptive + 구형 기기용)은 `node scripts/make-icons.mjs`가
`public/favicon.svg`와 같은 그림으로 만들어 `android/app/src/main/res/mipmap-*/`에 씁니다.
스토어 등록용 512px 아이콘은 `store/play-icon-512.png`. 그림을 바꿨으면 스크립트를 다시 돌리세요.

## 3. 릴리스 서명 (키스토어)

Play에 올리는 AAB는 내 키로 서명해야 합니다. **키스토어와 비밀번호는 절대 git에 올리지 마세요**
(`.gitignore`에 `*.keystore`, `*.jks`, `android/keystore.properties`가 들어 있어요).
키를 잃어버리면 같은 앱으로 업데이트를 낼 수 없으니 안전한 곳에 백업하세요.

### 3-1. 키스토어 만들기 (한 번만)

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -keystore C:\Users\bokuy\splander-release.jks -alias splander `
  -keyalg RSA -keysize 2048 -validity 10000
```

이름/조직 등을 묻는 질문에 답하고 비밀번호를 정합니다. 프로젝트 폴더 **밖**에 두는 걸 권해요.

### 3-2. 비밀번호 파일

`android/keystore.properties` (git에 안 올라감):

```properties
storeFile=C:/Users/bokuy/splander-release.jks
storePassword=여기에_키스토어_비밀번호
keyAlias=splander
keyPassword=여기에_키_비밀번호
```

### 3-3. `android/app/build.gradle`에 서명 설정 추가

`android {` 블록 안, `buildTypes` 위에:

```groovy
    def keystoreProps = new Properties()
    def keystoreFile = rootProject.file("keystore.properties")
    if (keystoreFile.exists()) {
        keystoreProps.load(new FileInputStream(keystoreFile))
    }
    signingConfigs {
        release {
            if (keystoreFile.exists()) {
                storeFile file(keystoreProps["storeFile"])
                storePassword keystoreProps["storePassword"]
                keyAlias keystoreProps["keyAlias"]
                keyPassword keystoreProps["keyPassword"]
            }
        }
    }
```

그리고 `buildTypes { release { ... } }` 안에 한 줄:

```groovy
            signingConfig signingConfigs.release
```

### 3-4. AAB 만들기

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npm run android:release
```

결과물: `android\app\build\outputs\bundle\release\app-release.aab`. 이 파일을 Play Console에 올립니다.
(Android Studio의 Build → Generate Signed App Bundle 메뉴로 해도 같은 결과예요.)

## 4. Google Play에 올리기

1. **개발자 계정**: [play.google.com/console](https://play.google.com/console) 에서 등록.
   1회 **US$25**, 신분증으로 본인 확인이 필요합니다. 개인 계정은 개발자 이름·이메일·
   (국가에 따라) 주소가 스토어에 공개돼요.
2. **앱 만들기**: 이름, 기본 언어(한국어), 앱/게임 → 게임, 무료.
3. **스토어 등록정보**에 필요한 것
   - 짧은 설명(80자) / 자세한 설명(4000자)
   - 앱 아이콘 512×512 PNG: `store/play-icon-512.png`
   - **그래픽 이미지(feature graphic) 1024×500** PNG/JPG: 직접 만들어야 합니다
   - **폰 스크린샷 2~8장** (가로세로 비율 16:9 ~ 9:16, 한 변 320~3840px). 에뮬레이터나 폰에서
     찍으면 됩니다. 7인치/10인치 태블릿 스크린샷은 태블릿을 지원할 때만.
4. **앱 콘텐츠**(정책 설문) 항목을 전부 채워야 심사에 넘어갑니다
   - **개인정보처리방침 URL**: 모든 앱에 필수. 이 앱은 계정·광고·분석이 없고, 게임 상태는 폰 안에만
     저장되며, 온라인 대전 때 공개 PeerJS 중계 서버(0.peerjs.com)와 상대 폰에 직접(WebRTC)
     연결된다는 점을 적은 간단한 페이지를 GitHub Pages 같은 곳에 올리면 됩니다.
   - **데이터 보안**: "수집하는 데이터 없음"으로 답할 수 있지만, 온라인 대전 시 연결을 위해
     IP 주소가 상대와 중계 서버에 드러난다는 점은 정직하게 적어 두세요.
   - **콘텐츠 등급**: IARC 설문(폭력·도박 등 없음 → 전체 이용가/3+).
   - 광고 없음, 대상 연령(13세 이상으로 하면 아동 정책 부담이 줄어요), 뉴스 앱 아님, 정부 앱 아님.
5. **앱 서명**: 처음 AAB를 올릴 때 "Play 앱 서명" 사용에 동의하면 Google이 최종 서명 키를
   보관하고, 내 키스토어는 업로드 키로 쓰입니다. (권장.)
6. **테스트 트랙**: 내부 테스트 → 비공개 테스트 → 프로덕션. **2023년 11월 이후 만든 개인 개발자
   계정은 프로덕션 전에 비공개 테스트를 테스터 12명 이상, 14일 연속으로 거쳐야 합니다**
   (Google 정책, 최신 조건은 콘솔에서 확인).
7. 프로덕션 출시 후 심사는 보통 며칠. 업데이트는 `versionCode`를 올려 새 AAB를 올리면 됩니다.

## 5. 설정된 것들 (참고)

- `capacitor.config.ts`: 앱 ID `io.github.bokuyong.splander`, 배경색 `#120F20`, 핀치 줌 금지,
  Android `allowMixedContent: false`, 상태 표시줄은 어두운 배경에 밝은 아이콘.
- `AndroidManifest.xml`: 세로 고정(`screenOrientation="portrait"`; Android 16은 큰 화면에서
  이 설정을 무시합니다), `usesCleartextTraffic="false"`. 권한은 INTERNET과
  (햅틱 플러그인이 넣는) VIBRATE뿐.
- `minSdk 24`(Android 7.0) / `targetSdk 36`(Android 16) — Capacitor 8 기본값. Play는 현재
  targetSdk 35 이상을 요구합니다.
- 시작 화면: 별도 이미지 없이 `#120F20` 단색 창 위에 런처 아이콘(Android 12+ 시스템 스플래시).
- 네이티브 앱 안에서는 PWA 서비스 워커를 등록하지 않습니다(파일이 앱 안에 있으니 필요 없음).
  "내 차례" 진동은 `@capacitor/haptics`로 울립니다.
- `android/` 아래 `app/build`, `.gradle`, `local.properties`, `app/src/main/assets/public`
  (dist 복사본)은 git에 올라가지 않고 빌드 때마다 다시 만들어집니다.
