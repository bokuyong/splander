// Screen router. The game screen only ever sees a GameController, so swapping
// the local controller for an online one happens here and nowhere else.
import { useCallback, useState } from 'react'
import type { NewGameConfig } from './shared/contract'
import { chooseAction } from './ai'
import { createLocalController, loadSavedGame } from './ui/controller'
import { track } from './ui/logic/analytics'
import type { GameController } from './ui/controller'
import { GameScreen } from './ui/game/GameScreen'
import { HomeScreen, HowToPage, LocalSetup, SoloSetup } from './ui/home/HomeScreens'
import { ArtDefs } from './ui/components/ArtDefs'
import { OnlineFlow } from './ui/online/OnlineFlow'
import { shouldAutoResume } from './ui/online/roomStore'

type Screen =
  | { name: 'home' }
  | { name: 'solo' }
  | { name: 'local' }
  | { name: 'online'; resume?: boolean }
  | { name: 'howto' }
  | { name: 'game'; controller: GameController }

export default function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    // Reloaded (or reopened) in the middle of an online game: go straight back in.
    shouldAutoResume() ? { name: 'online', resume: true } : { name: 'home' },
  )
  const [saved, setSaved] = useState(loadSavedGame)

  const goHome = useCallback(() => {
    setScreen((current) => {
      if (current.name === 'game') current.controller.dispose?.()
      return { name: 'home' }
    })
    setSaved(loadSavedGame())
  }, [])

  const play = (controller: GameController) => setScreen({ name: 'game', controller })
  const startLocal = (players: NewGameConfig['players']) => {
    track(players.some((p) => p.kind === 'ai') ? 'start-solo' : 'start-local')
    play(createLocalController({ players, chooseAction }))
  }

  let content
  switch (screen.name) {
    case 'home':
      content = (
        <HomeScreen
          saved={saved}
          onResume={() => saved && play(createLocalController({ resume: saved, chooseAction }))}
          onSolo={() => setScreen({ name: 'solo' })}
          onLocal={() => setScreen({ name: 'local' })}
          onOnline={() => setScreen({ name: 'online' })}
          onHowTo={() => setScreen({ name: 'howto' })}
        />
      )
      break
    case 'solo':
      content = <SoloSetup onBack={goHome} onStart={startLocal} />
      break
    case 'local':
      content = <LocalSetup onBack={goHome} onStart={startLocal} />
      break
    case 'online':
      // OnlineFlow owns the net session and renders menu, lobby and the game
      // table (through a GameController adapter) itself.
      content = <OnlineFlow onExit={goHome} autoResume={screen.resume} />
      break
    case 'howto':
      content = <HowToPage onBack={goHome} />
      break
    case 'game':
      content = <GameScreen controller={screen.controller} onExit={goHome} />
      break
  }

  return (
    <div className="app">
      <ArtDefs />
      <div className="stars" aria-hidden="true" />
      {content}
    </div>
  )
}
