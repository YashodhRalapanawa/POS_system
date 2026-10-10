import { useEffect, useRef, useState } from 'react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { formatDate, formatDateTime, getInitials } from './profileFormat'

const MAX_PHOTO_BYTES = 2 * 1024 * 1024

function ProfileSummaryCard({ user }) {
  const fileInputRef = useRef(null)
  // Local preview only (object URL) — nothing is uploaded or persisted.
  const [photoUrl, setPhotoUrl] = useState(user.avatarUrl || null)
  const [photoError, setPhotoError] = useState('')

  // Release each object URL when it is replaced or the card unmounts.
  useEffect(() => {
    return () => {
      if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file (for example JPG, PNG or WebP).')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Image must be 2 MB or smaller.')
      return
    }

    setPhotoError('')
    setPhotoUrl(URL.createObjectURL(file))
  }

  const removePhoto = () => {
    setPhotoError('')
    setPhotoUrl(null)
  }

  const details = [
    { label: 'Employee Code', value: user.employeeCode },
    { label: 'Store', value: user.storeName },
    { label: 'Member Since', value: formatDate(user.memberSince) },
    { label: 'Last Login', value: formatDateTime(user.lastLogin) },
  ]

  return (
    <Card className="profile-card profile-summary">
      <div className="profile-summary__identity">
        {photoUrl ? (
          <img className="profile-avatar" src={photoUrl} alt={`Profile photo of ${user.fullName}`} />
        ) : (
          <div className="profile-avatar profile-avatar--initials" aria-hidden="true">
            {getInitials(user.fullName)}
          </div>
        )}
        <h3 className="profile-summary__name">{user.fullName}</h3>
        <div className="profile-summary__badges">
          <Badge tone="info">{user.role}</Badge>
          <Badge tone={user.status === 'Active' ? 'success' : 'danger'}>{user.status}</Badge>
        </div>
      </div>

      <div className="profile-summary__photo">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="auth-sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileChange}
        />
        <div className="profile-summary__photo-actions">
          <Button variant="secondary" type="button" onClick={() => fileInputRef.current?.click()}>
            Change Photo
          </Button>
          {photoUrl && (
            <Button variant="ghost" type="button" onClick={removePhoto}>
              Remove Photo
            </Button>
          )}
        </div>
        {photoError && (
          <p className="profile-field__error" role="alert">
            {photoError}
          </p>
        )}
        <p className="profile-note">Photo is stored locally until backend storage is connected.</p>
      </div>

      <dl className="profile-details">
        {details.map((item) => (
          <div key={item.label} className="profile-details__row">
            <dt>{item.label}</dt>
            <dd>{item.value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export default ProfileSummaryCard
