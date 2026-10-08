// `<img>` for optional real artwork (public/art/<path>.webp) that hides itself,
// and remembers, when the file does not exist; the SVG fallback stays visible.
import type { CSSProperties } from 'react'
import { artUrl, markArt, useArt } from '../logic/art'

interface ArtImageProps {
  /** Path under public/art/, e.g. "nobles/n-03.webp". */
  path: string
  alt?: string
  className?: string
  style?: CSSProperties
}

export function ArtImage({ path, alt = '', className, style }: ArtImageProps) {
  const url = artUrl(path)
  const state = useArt(path)
  if (state === 'missing') return null
  return (
    <img
      className={`art${state === 'ok' ? ' is-loaded' : ''}${className ? ` ${className}` : ''}`}
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={style}
      onLoad={() => markArt(url, 'ok')}
      onError={() => markArt(url, 'missing')}
    />
  )
}
