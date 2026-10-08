# 아트워크 폴더 (public/art)

이 폴더에 WebP 파일을 넣으면 앱이 자동으로 사용합니다. 파일이 없으면 코드로 그린
SVG 그림이 대신 보이므로, 하나씩 준비되는 대로 넣어도 됩니다. 파일 이름은 아래와
**정확히** 같아야 합니다 (소문자, 확장자 `.webp`).

## 개발 카드 장면 (15장)

`cards/t{단계}-{보석}.webp`

| 단계 | 보석 | 파일 이름 |
|---|---|---|
| 1단계 광산 | 다이아몬드 / 사파이어 / 에메랄드 / 루비 / 오닉스 | `cards/t1-white.webp` `cards/t1-blue.webp` `cards/t1-green.webp` `cards/t1-red.webp` `cards/t1-black.webp` |
| 2단계 공방 | 〃 | `cards/t2-white.webp` `cards/t2-blue.webp` `cards/t2-green.webp` `cards/t2-red.webp` `cards/t2-black.webp` |
| 3단계 상점 | 〃 | `cards/t3-white.webp` `cards/t3-blue.webp` `cards/t3-green.webp` `cards/t3-red.webp` `cards/t3-black.webp` |

- 카드 위쪽 57% 영역에 `object-fit: cover`로 꽉 채워 보입니다. 권장 비율 **3:2 (가로:세로)**, 예: 900×600.
- 위쪽에는 반투명한 어두운 띠가 덮이고 그 위에 점수 숫자(왼쪽)와 보석(오른쪽)이 올라갑니다. 중요한 요소는 가운데·아래쪽에 두세요.
- 분위기: 르네상스 보석 상인. 1단계는 광산, 2단계는 공방(모루·대장간), 3단계는 궁전·상점. 각 보석 색으로 물든 조명.

## 귀족 초상 (10장)

`nobles/n-01.webp` … `nobles/n-10.webp`

| 파일 | 귀족 |
|---|---|
| `nobles/n-01.webp` | 공작 부인 |
| `nobles/n-02.webp` | 대상인 길드장 |
| `nobles/n-03.webp` | 추기경 |
| `nobles/n-04.webp` | 백작 |
| `nobles/n-05.webp` | 항해왕 |
| `nobles/n-06.webp` | 왕실 보석상 |
| `nobles/n-07.webp` | 궁정 화가 |
| `nobles/n-08.webp` | 후작 부인 |
| `nobles/n-09.webp` | 총독 |
| `nobles/n-10.webp` | 대공 |

- 타원 금테 안에 보입니다. 권장 비율 **4:5 (세로가 김)**, 예: 480×600. 얼굴이 가운데 오도록, 가장자리는 잘려도 되는 여백을 두세요.
- 실제 역사 인물이나 다른 게임의 그림을 따라 그리지 마세요. 이 게임만의 가상의 인물입니다.

## 첫 화면 키아트 (1장)

`home/keyart.webp`

- 첫 화면 전체 배경으로 꽉 채워 보입니다(`object-fit: cover`, 위쪽 기준). 권장 **세로형 9:16 이상**, 예: 1080×1920.
- 아래 40%에는 제목과 버튼이 올라가고 어두운 그라데이션이 덮이므로, 주인공(왕관·보석 더미 등)은 **위쪽 60%**에 두세요.

## 참고

- PNG 권장 (ChatGPT 등이 내놓는 형식 그대로). 용량은 카드 1장당 300KB 이하, 키아트 1MB 이하를 권장합니다.
- 파일을 넣은 뒤 `npm run build`를 다시 하면 오프라인(PWA) 캐시에도 포함됩니다.
- 이 폴더의 README 외에는 자리표시 파일을 두지 마세요. 없는 파일은 앱이 한 번만 확인하고 SVG로 대체합니다.
