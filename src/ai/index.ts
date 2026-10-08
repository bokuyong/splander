// Computer opponents. `chooseAction` picks an action for state.currentPlayer in
// whatever phase the state is in ('action', 'discard' or 'chooseNoble').
//
// All three levels are deterministic functions of the public part of the
// state: see fairView() in ./common for how hidden information is kept out.

import type { Action, ChooseAction, Difficulty, GameState } from '../shared/contract'
import { getLegalActions } from '../engine'
import { fairView, makeRng, publicHash } from './common'
import { chooseEasy } from './easy'
import { chooseHard } from './hard'
import { chooseNormal } from './normal'

const SALT: Record<Difficulty, number> = { easy: 0x1e, normal: 0x2f, hard: 0x3a }

export const chooseAction: ChooseAction = (state: GameState, difficulty: Difficulty): Action => {
  if (state.phase === 'gameOver') {
    throw new Error('chooseAction called after the game is over')
  }
  const view = fairView(state)
  let action: Action
  if (difficulty === 'hard') action = chooseHard(view)
  else {
    const rng = makeRng(publicHash(view, SALT[difficulty] ?? 0))
    action = difficulty === 'easy' ? chooseEasy(view, rng) : chooseNormal(view, rng)
  }
  return action ?? getLegalActions(state)[0]
}
