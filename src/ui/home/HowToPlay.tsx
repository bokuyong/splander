// Concise rules in the theme's own words. Used as a page and inside a sheet.
import { COLORS } from '../../shared/contract'
import { CARDS, NOBLES, THEME } from '../../data'
import { MAX_RESERVED, MAX_TOKENS, WINNING_SCORE } from '../../engine'
import { CardFace } from '../components/CardView'
import { Chip } from '../components/Chip'
import { GuestTile } from '../components/GuestTile'
import { CardsIcon, CrownIcon, GemIcon, HandIcon, PalaceIcon } from '../components/Icons'

const SAMPLE = CARDS.find((c) => c.tier === 2 && c.points === 2) ?? CARDS[0]

export function HowToPlayContent() {
  const L = THEME.labels
  return (
    <div className="howto">
      <section>
        <h3>
          <CrownIcon /> 목표
        </h3>
        <p>
          {L.tokens}을 모아 {L.card}를 사들이고, {L.points} <b>{WINNING_SCORE}점</b>에 먼저 닿으면 이겨요. 누군가{' '}
          {WINNING_SCORE}점이 되면 그 바퀴를 끝까지 돌고, 가장 높은 사람이 {L.winner}! 점수가 같으면 카드를 더 적게 산
          쪽이 이겨요.
        </p>
      </section>

      <section>
        <h3>
          <GemIcon /> 내 차례엔 하나만
        </h3>
        <ul className="howto-actions">
          <li>
            <b>{THEME.actions.takeDifferent}</b>
            <span>{THEME.actionHints.takeDifferent}</span>
          </li>
          <li>
            <b>{THEME.actions.takeSame}</b>
            <span>{THEME.actionHints.takeSame}</span>
          </li>
          <li>
            <b>{THEME.actions.buy}</b>
            <span>
              {THEME.actionHints.buy}. 예약해 둔 카드도 살 수 있어요
            </span>
          </li>
          <li>
            <b>{THEME.actions.reserveBoard}</b>
            <span>
              {THEME.actionHints.reserveBoard}. 더미 맨 위 카드를 몰래 예약할 수도 있어요
            </span>
          </li>
        </ul>
        <div className="howto-chips">
          {COLORS.map((c) => (
            <span key={c}>
              <Chip color={c} size={30} />
              {THEME.tokens[c].name}
            </span>
          ))}
          <span>
            <Chip color="gold" size={30} />
            {THEME.tokens.gold.name}
          </span>
        </div>
        <p>
          {THEME.tokens.gold.name}은 어떤 색 {L.token}으로든 쓸 수 있는 조커예요. {L.tokens}은 {MAX_TOKENS}개까지만 들
          수 있고, 예약은 {MAX_RESERVED}장까지예요.
        </p>
      </section>

      <section>
        <h3>
          <CardsIcon /> {L.card} 읽는 법
        </h3>
        <div className="howto-card">
          <span className="howto-card-art card-btn">
            <CardFace card={SAMPLE} size="large" />
          </span>
          <ul>
            <li>
              <b>왼쪽 위 숫자</b> {L.points}
            </li>
            <li>
              <b>오른쪽 위 보석</b> {L.bonus}: 이 색 {L.token} 값을 앞으로 계속 1개씩 깎아 줘요
            </li>
            <li>
              <b>아래 동그라미</b> 카드 값. 색깔별로 내야 할 {L.token} 수예요
            </li>
          </ul>
        </div>
        <p>
          {L.bonus}이 늘수록 카드가 싸져서, 나중엔 {L.token} 없이도 살 수 있어요. 지금 살 수 있는 카드는 금빛으로
          빛나요.
        </p>
      </section>

      <section>
        <h3>
          <PalaceIcon /> {L.guests}
        </h3>
        <div className="howto-guest">
          <GuestTile guest={NOBLES[4]} showName />
        </div>
        <p>
          귀족마다 눈여겨보는 {L.bonus}이 있어요. 조건을 채우면 차례가 끝날 때 저절로 방문해 {L.points} 3점을 줘요. 한
          차례에 한 명만 오고, 둘 이상이 오려 하면 내가 골라요.
        </p>
      </section>

      <section>
        <h3>
          <HandIcon /> 조작
        </h3>
        <p>
          카드를 톡 누르면 크게 보이고 구매·예약 버튼이 나와요. 아래 {L.bank}의 {L.token}을 눌러 고른 뒤 ‘가져오기’를
          누르면 돼요. 더미를 누르면 몰래 예약할 수 있어요.
        </p>
      </section>
    </div>
  )
}
