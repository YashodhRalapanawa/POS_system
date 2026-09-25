import Button from './ui/Button'

function RestoreDefaultsModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Restore Default Settings?</h3>
        <p>This will replace the current saved settings with the default Vantrix POS configuration.</p>
        <div className="confirmation-modal__actions">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="button" onClick={onConfirm}>Restore Defaults</Button>
        </div>
      </div>
    </div>
  )
}

export default RestoreDefaultsModal
