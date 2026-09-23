import { useEffect, useId, useRef } from 'react'

export default function CardActionDialog({
  open,
  title,
  onClose,
  onConfirm,
  confirmLabel = '确定',
  cancelLabel = '取消',
  busy = false,
  tone = 'default',
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  onConfirm: () => void
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  tone?: 'default' | 'danger' | 'primary'
  children?: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      cancelRef.current?.focus()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      className="card-action-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(e) => {
        const el = ref.current
        if (!el || busy) return
        if (e.target === el) {
          const rect = el.getBoundingClientRect()
          const x = e.clientX
          const y = e.clientY
          if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            onClose()
          }
        }
      }}
    >
      <div className="card-action-dialog-inner">
        <div className="modal-head">
          <h2 id={titleId} style={{ margin: 0 }}>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        <div className="row wrap" style={{ gap: 12, marginTop: 12 }}>
          <button
            ref={cancelRef}
            className="sm"
            style={{ minHeight: 44, flex: '1 1 120px' }}
            disabled={busy}
            onClick={() => {
              if (!busy) onClose()
            }}
          >
            {cancelLabel}
          </button>
          <button
            className={`sm ${tone === 'danger' ? 'ghost' : tone === 'primary' ? 'primary' : ''}`}
            style={{ minHeight: 44, flex: '1 1 120px' }}
            disabled={busy}
            onClick={() => {
              if (!busy) onConfirm()
            }}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        .card-action-dialog {
          max-width: 480px;
          width: calc(100% - 32px);
          max-height: calc(100dvh - 32px);
          overflow-y: auto;
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 16px;
          background: var(--panel);
          color: var(--text);
          box-shadow: 0 12px 40px rgba(0,0,0,.45);
          box-sizing: border-box;
        }
        .card-action-dialog::backdrop {
          background: rgba(0,0,0,.55);
        }
        .card-action-dialog-inner {
          overflow-wrap: anywhere;
        }
      `}</style>
    </dialog>
  )
}
