// The bare cut stone (no rim), sized by CSS. Kept as the inline gem mark used
// in text, bonus marks and lists; the drawing lives in GemToken.
import type { TokenColor } from '../../shared/contract'
import { GemToken } from './GemToken'

export function Glyph({ color, className }: { color: TokenColor; className?: string }) {
  return <GemToken color={color} variant="bare" className={`glyph${className ? ` ${className}` : ''}`} />
}
