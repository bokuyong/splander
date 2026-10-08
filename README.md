# 스플랜더 (Splander)

르네상스 보석 상인이 되어 명성을 쌓는 카드 게임이에요. 두 사람이 각자 폰으로 함께 즐기려고 만든
비공개 · 비상업 모바일 웹 게임(PWA)입니다. 보석을 모아 개발 카드를 사들이고, 귀족의 방문을 받아
명성 점수 15점을 먼저 모으면 이겨요.

- **혼자 하기**: AI(쉬움 / 보통 / 어려움)와 대결
- **같이 하기**: 폰 한 대를 번갈아 건네며 2~4명
- **온라인**: 각자 폰으로. 한 사람이 방을 만들고 5글자 코드를 알려 주면 상대가 들어와요

서버가 따로 없습니다. 온라인은 방을 만든 사람의 폰이 방이 되고(WebRTC, PeerJS 공개 중계 서버 사용),
게임은 각자 폰에 저장돼서 새로고침하거나 화면이 꺼졌다 켜져도 이어집니다.

## 실행

Node.js 20 이상이 필요해요.

```bash
npm install     # 처음 한 번
npm run dev     # http://localhost:5173
```

## 테스트와 빌드

```bash
npx vitest run                          # 전체 테스트
npx vitest run src/ui/online            # 한 모듈만
npx tsc --noEmit -p tsconfig.app.json   # 타입 검사
npm run build                           # dist/ 에 배포용 파일 생성
npx vite preview                        # 빌드 결과를 http://localhost:4173 에서 확인
```

아이콘(PNG)은 `public/favicon.svg`와 같은 그림을 그리는 스크립트로 만듭니다. 그림을 바꿨다면
`node scripts/make-icons.mjs`를 다시 실행하세요.

## 개발 중에 폰으로 열어 보기 (같은 Wi-Fi)

```bash
npm run dev -- --host
```

터미널에 나오는 `Network: http://192.168.x.x:5173` 주소를 폰 브라우저에 입력하면 화면을 볼 수 있어요.

단, 이 주소는 HTTPS가 아니라서 **화면 확인과 혼자 하기 / 같이 하기까지만** 됩니다.
온라인 대전(WebRTC)과 홈 화면 설치 · 오프라인 실행(서비스 워커)은 브라우저가 HTTPS 또는
`localhost`에서만 허용해요. 그래서 **두 폰으로 진짜 온라인 대전을 하려면 아래처럼 HTTPS로 배포한
주소**를 써야 합니다.

PC 한 대에서 온라인을 시험할 때는 탭 두 개를 서로 다른 주소로 여세요
(예: `http://localhost:5173` 과 `http://guest.localhost:5173`). 같은 주소의 탭끼리는 저장 공간을
같이 써서 "하던 방" 정보가 섞입니다. 실제로는 폰이 두 대라 문제가 없어요.

## 배포: GitHub Pages (한 가지 방법)

`vite.config.ts`에 `base: './'`가 설정되어 있어서 `https://<아이디>.github.io/<저장소>/` 같은
하위 경로에서도 그대로 동작합니다. HTTPS가 되는 정적 호스팅이면 어디든 `dist/` 폴더만 올리면 돼요.

1. GitHub에서 새 저장소를 만듭니다. (무료 계정의 GitHub Pages는 공개 저장소에서만 됩니다.
   주소를 아는 사람은 누구나 열 수 있다는 점은 알아 두세요.)
2. 이 폴더를 그 저장소에 올립니다.
   ```bash
   git add -A
   git commit -m "스플랜더"
   git branch -M main
   git remote add origin https://github.com/<아이디>/<저장소>.git
   git push -u origin main
   ```
3. 빌드합니다.
   ```bash
   npm run build
   ```
4. `dist/` 폴더의 내용을 `gh-pages` 브랜치로 올립니다. (`dist`는 `.gitignore`에 들어 있어서
   그 안에서 따로 올려요.)
   ```bash
   cd dist
   git init -b gh-pages
   git add -A
   git commit -m "deploy"
   git push -f https://github.com/<아이디>/<저장소>.git gh-pages
   cd ..
   ```
5. 저장소의 **Settings → Pages**에서 Source를 **Deploy from a branch**, Branch를
   **gh-pages / (root)** 로 고르고 저장합니다.
6. 1~2분 뒤 `https://<아이디>.github.io/<저장소>/` 를 두 폰에서 엽니다.
7. 홈 화면에 추가하면 앱처럼 열려요.
   - iPhone(Safari): 공유 버튼 → **홈 화면에 추가**
   - Android(Chrome): 메뉴 → **앱 설치** 또는 **홈 화면에 추가**

새 버전을 올릴 때는 3~4번만 다시 하면 됩니다. 앱은 다음에 열 때 스스로 새 버전으로 바뀌어요
(`autoUpdate`). 온라인 대전 중 "앱 버전이 달라요"가 나오면 두 폰 모두 앱을 닫았다가 다시 여세요.

## 온라인 대전 메모

- 방을 만든 사람(방 주인)의 폰이 게임을 진행합니다. 방 주인이 앱을 닫으면 상대는 기다리게 되고,
  방 주인이 다시 열면 같은 코드로 이어집니다.
- 화면이 잠기거나 연결이 끊기면 위쪽에 작은 띠로 알려 주고 저절로 다시 연결해요.
- 메뉴(☰) → **처음 화면으로**에서 잠깐 나가기 / 대기실로 돌아가기 / 방 닫기를 고를 수 있어요.
- 통신사 망이나 일부 공유기에서는 두 폰이 직접 연결되지 못할 수 있습니다. 그럴 때는 같은 Wi-Fi에서
  해 보세요.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/shared/contract.ts` | 모듈들이 함께 쓰는 타입 |
| `src/engine/` | 규칙 엔진 (순수 함수) |
| `src/data/` | 카드 90장, 귀족 10명, 테마 문구 |
| `src/ai/` | 컴퓨터 상대 |
| `src/net/` | 온라인 (PeerJS, 방 주인 기준 진행) |
| `src/ui/` | 화면. `src/ui/online/`이 온라인 연결부 |

## 네이티브 앱 (Android / iOS)

같은 `npm run build` 결과물을 [Capacitor](https://capacitorjs.com)로 감싼 스토어용 앱 프로젝트가
`android/`와 `ios/`에 있습니다. 설정은 `capacitor.config.ts`.

```bash
npm run cap:sync        # 웹 빌드 + android/, ios/ 에 복사
npm run android:debug   # 위 + 디버그 APK (android/app/build/outputs/apk/debug/app-debug.apk)
```

Android는 JDK 21이 필요해요(Android Studio에 들어 있는 `jbr` 폴더를 `JAVA_HOME`으로).
스토어에 올리는 절차와 필요한 계정·서명·심사 자료는 [docs/release-android.md](docs/release-android.md),
[docs/release-ios.md](docs/release-ios.md)에 정리했습니다. iOS는 Mac + Xcode가 있어야 빌드됩니다.
