// Bottom sheet / modal shell. `locked` sheets (discard, guest choice) cannot
// be dismissed by tapping outside.
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { CloseIcon } from './Icons'

interface SheetProps {
  title?: ReactNode
  onClose?: () => void
  locked?: boolean
  /** 'center' renders a floating dialog instead of a bottom sheet. */
  placement?: 'bottom' | 'center'
  children: ReactNode
  className?: string
}

export function Sheet({ title, onClose, locked, placement = 'bottom', children, className }: SheetProps) {
  useEffect(() => {
    if (locked || !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, onClose])

  return (
    <div
      className={`sheet-scrim sheet-${placement}`}
      onClick={locked ? undefined : onClose}
      role="presentation"
    >
      <div
        className={`sheet${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {placement === 'bottom' && <span className="sheet-grip" aria-hidden="true" />}
        {(title || (onClose && !locked)) && (
          <div className="sheet-head">
            <h2 className="sheet-title">{title}</h2>
            {onClose && !locked && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
                <CloseIcon />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
