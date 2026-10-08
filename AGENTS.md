# 스플랜더 (Splander)

Named 스플랜더 (Splander). A private, non-commercial mobile web game (PWA) for two people to play together.
Its rules are identical to the well-known gem-trading board game, and its look
follows that game's spirit (Renaissance gem merchants: gems, development cards,
nobles, prestige), but every text, name and drawing is original. Never write the
original game's name, its publisher's names, its historical noble names or its
artwork anywhere in code, UI or assets.

## Theme mapping

| Original concept | This game | Internal id |
|---|---|---|
| Gem tokens | 보석 (gems) | `white` 다이아몬드, `blue` 사파이어, `green` 에메랄드, `red` 루비, `black` 오닉스 |
| Gold joker | 황금 | `gold` |
| Development cards | 개발 카드: 1단계 광산, 2단계 공방, 3단계 상점 | tier 1/2/3 |
| Card bonus | 보석 할인 (permanent discount) | `bonus` |
| Nobles | 귀족 (invented Korean titles, crest tiles) | `Noble` |
| Prestige points | 명성 점수 | `points` |
| Reserve / buy / take | 예약 / 구매 / 보석 가져오기 | actions |

Look: deep velvet, dark lacquer panels, gold hairlines and headings, gems drawn as
cut stones (src/ui/components/GemToken.tsx), parchment cards with SVG scenes
(CardScene.tsx), nobles as silhouette portraits (NobleCrest.tsx), line icons
(Icons.tsx), fonts bundled in public/fonts (Cinzel + Hahmlet, OFL).
No network assets at runtime. Optional PNG artwork in public/art/ (see its README)
replaces the SVG fallbacks when present.

UI text is Korean. Gems are counted with 개, cards with 장.

## Stack

Vite + React + TypeScript, zustand for UI state, peerjs for online play,
vitest for tests. Dependencies are already installed: do not run `npm install`
or add packages without asking the orchestrator.

## Layout and ownership

Each module is owned by one agent. Stay inside your own directory.

- `src/shared/contract.ts` : shared types and API signatures (read-only)
- `src/engine/` : pure rules engine
- `src/data/` : the 90 cards, 10 nobles, theme texts
- `src/ai/` : computer opponents
- `src/net/` : online multiplayer
- `src/ui/`, `src/App.tsx`, `src/main.tsx`, `index.html` : screens

Run only your own tests, e.g. `npx vitest run src/engine`.
