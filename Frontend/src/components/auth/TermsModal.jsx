import { useEffect, useRef } from 'react'
import Button from '../ui/Button'

const documents = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
}

// Placeholder until the legal documents are published with the product.
function TermsModal({ doc, onClose }) {
  const closeRef = useRef(null)
  const title = documents[doc]

  useEffect(() => {
    if (!title) return undefined
    const previouslyFocused = document.activeElement
    closeRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [title, onClose])

  if (!title) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="terms-modal-title">{title}</h3>
        <p>
          The {title} will be available when Vantrix POS is published. You&rsquo;ll be able to review it here before
          your store goes live.
        </p>
        <div className="confirmation-modal__actions">
          <Button ref={closeRef} variant="primary" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

export default TermsModal
