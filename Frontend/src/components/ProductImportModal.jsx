import { useEffect, useRef, useState } from 'react'
import Button from './ui/Button'

function formatFileSize(bytes) {
  if (!bytes) return ''

  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ProductImportModal({ isOpen, onClose, onImport }) {
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null)
      setError('')
      setSuccessMessage('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setError('')
    setSuccessMessage('')
  }

  const handleImport = () => {
    if (!selectedFile) {
      setError('Please select a CSV file first.')
      setSuccessMessage('')
      return
    }

    onImport(selectedFile)
    setSuccessMessage('Products imported successfully.')
    setError('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal product-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Catalog Import</span>
            <h3>Import Products</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="product-import-modal__body">
          <p>Import products from a CSV file into the product catalog.</p>

          <label className="product-import-upload" onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelection}
              hidden
            />
            <span className="product-import-upload__button">Choose CSV File</span>
            <span className="product-import-upload__text">Drag and drop a CSV file here</span>
            <small>Accepted format: CSV</small>
          </label>

          {selectedFile && (
            <div className="product-import-file">
              <strong>{selectedFile.name}</strong>
              <span>{formatFileSize(selectedFile.size)}</span>
            </div>
          )}

          {error && <div className="field-error">{error}</div>}
          {successMessage && <div className="success-message">{successMessage}</div>}
        </div>

        <div className="modal__actions">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="button" onClick={handleImport}>Import Products</Button>
        </div>
      </div>
    </div>
  )
}

export default ProductImportModal
