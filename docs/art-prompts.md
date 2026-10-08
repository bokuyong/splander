# 그림 생성 가이드 (ChatGPT 이미지)

생성한 그림을 아래 파일 이름으로 `public/art/` 안에 넣으면 앱이 자동으로 사용합니다.
파일이 없으면 코드로 그린 기본 그림이 나옵니다.

```
public/art/
├── home/keyart.webp          홈 화면 배경 1장
├── cards/t1-white.webp       카드 삽화 15장 (단계 3 × 보석 5색)
│   ... t1~t3 × white/blue/green/red/black
└── nobles/n-01.webp          귀족 초상화 10장 (n-01 ~ n-10)
```

## 팁

- ChatGPT에 먼저 **스타일 문단**을 한 번 주고, 그다음 그림마다 **개별 문단**을 이어서 요청하면 스타일이 일정하게 나옵니다.
- 한 대화 안에서 쭉 만드세요. 대화를 바꾸면 화풍이 달라집니다.
- 생성된 그림에 글자가 들어가면 "no text, no letters, no watermark"를 덧붙여 다시 요청하세요.
- 저장할 때 PNG 그대로 두면 됩니다. 크기가 크면(2~3MB 이상) 나중에 제가 줄이겠습니다.

## 공통 스타일 문단 (대화 처음에 한 번)

```
I'm making illustrations for a Renaissance-era gem merchant board game. Keep one consistent style across every image I ask for in this chat: painterly digital illustration, rich oil-painting texture, warm candlelit lighting, deep jewel-tone palette (navy, burgundy, emerald, gold), soft vignette at the edges, no text, no letters, no watermark, no borders or frames. Compositions should be simple and readable even when shown very small.
```

## 1. 홈 화면 배경 (1장) — `home/keyart.webp`

세로 그림으로 요청하세요 (1024×1536 또는 9:16).

```
Vertical portrait composition. A treasure of large faceted gems — a diamond, a sapphire, an emerald, a ruby and an onyx — piled on dark velvet beneath an ornate gold crown, dramatic light rays and sparkles, a Renaissance merchant's study blurred in the background with candles and maps. Keep the lower third dark and uncluttered so UI buttons can sit over it. Same style as before.
```

## 2. 카드 삽화 (15장) — `cards/t{단계}-{색}.webp`

가로가 약간 더 긴 비율(예: 1024×768, 4:3)로 요청하세요. 카드 상단에 들어갑니다.

색별 공통 요소:

| 파일 색 | 보석 | 그림에 넣을 색감 |
|---|---|---|
| white | 다이아몬드 | 차가운 흰빛, 은색, 서리 |
| blue | 사파이어 | 깊은 파랑, 바다, 밤하늘 |
| green | 에메랄드 | 짙은 초록, 숲, 이끼 |
| red | 루비 | 진홍, 불빛, 와인 |
| black | 오닉스 | 검정, 흑요석, 연기 |

단계별 장면:

- **1단계 광산 (t1)**: 광부들이 동굴 벽에서 그 보석의 원석을 캐는 장면
- **2단계 공방 (t2)**: 장인이 작업대에서 그 보석을 세공하는 장면
- **3단계 상점 (t3)**: 화려한 보석 상점이나 궁정에서 완성된 보석이 진열된 장면

예시 프롬프트 (아래 틀에 색만 바꿔 15번 요청):

```
t1-blue: Landscape 4:3. Inside a dim mine tunnel, two miners with lanterns chip glowing raw sapphire crystals out of the rock wall, deep blue light reflecting on wet stone. Same style as before.

t2-blue: Landscape 4:3. A Renaissance gem cutter at a wooden workbench polishes a large sapphire on a grinding wheel, blue sparkle on his magnifying lens, tools and velvet cloth around. Same style as before.

t3-blue: Landscape 4:3. An opulent jeweler's shop interior with sapphire necklaces displayed on velvet under golden candelabras, a wealthy patron admiring them. Same style as before.
```

white/green/red/black은 위 문장의 sapphire를 diamond / emerald / ruby / onyx로, 색감을 위 표대로 바꾸면 됩니다.

## 3. 귀족 초상화 (10장) — `nobles/n-01.webp` ~ `n-10.webp`

정사각형(1024×1024)으로 요청하세요. 어깨 위 초상화, 어두운 배경.

```
n-01 공작 부인: Square portrait, shoulders up, of a Renaissance duchess in a jeweled gown and pearl headdress, dignified expression, dark background. Same style as before.
n-02 대상인 길드장: ... a stout merchant guild master in fur-trimmed robes holding a ledger and gold chain of office ...
n-03 추기경: ... a cardinal in red robes and cap, stern and thoughtful ...
n-04 백작: ... a young count in a black doublet with a silver medallion, confident ...
n-05 항해왕: ... a weathered sea captain in a navy coat with a compass, salt wind in his hair ...
n-06 왕실 보석상: ... a royal jeweler with a loupe over one eye and a tray of gems, delighted ...
n-07 궁정 화가: ... a court painter with a brush and paint-stained collar, curious gaze ...
n-08 후작 부인: ... a marchioness in a green velvet dress with an emerald choker, elegant and amused ...
n-09 총독: ... a governor in a dark coat with a sash and seal ring, imposing ...
n-10 대공: ... an archduke in ermine and a small gold circlet, calm authority ...
```

각 줄의 `...` 자리에 앞의 "Square portrait, shoulders up, of" 문장 틀을 그대로 쓰면 됩니다.

## 다 만든 뒤

1. 파일을 위 이름대로 `public/art/` 하위 폴더에 넣습니다.
2. 개발 서버를 켜서 확인합니다.

```bash
npm run dev
```

3. 마음에 안 드는 그림만 다시 생성해 덮어쓰면 됩니다.
