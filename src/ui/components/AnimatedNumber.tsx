// A number that ticks toward its new value instead of jumping.
import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../logic/motion'

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const [bump, setBump] = useState(0)
  const shownRef = useRef(value)

  useEffect(() => {
    if (shownRef.current === value) return
    if (prefersReducedMotion()) {
      shownRef.current = value
      setShown(value)
      return
    }
    setBump((n) => n + 1)
    const id = setInterval(() => {
      const cur = shownRef.current
      const next = cur + Math.sign(value - cur)
      shownRef.current = next
      setShown(next)
      if (next === value) clearInterval(id)
    }, 140)
    return () => clearInterval(id)
  }, [value])

  return (
    <span className={`ticker${bump ? ' is-ticking' : ''}${className ? ` ${className}` : ''}`} key={bump}>
      {shown}
    </span>
  )
}
