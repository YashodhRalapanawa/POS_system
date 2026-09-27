import { useAuth } from '../../context/AuthContext'
import ProfileSummaryCard from './ProfileSummaryCard'
import PersonalInfoCard from './PersonalInfoCard'
import ChangePasswordCard from './ChangePasswordCard'
import PreferencesCard from './PreferencesCard'
import SecurityActivityCard from './SecurityActivityCard'

// The signed-in staff member's own account. All changes apply to them only.
function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <div className="products-page profile-page">
      <header className="products-page__header">
        <div>
          <span className="section-label">ACCOUNT</span>
          <h2>My Profile</h2>
          <p>Manage your personal details, password, and POS preferences.</p>
        </div>
      </header>

      {/* Keyed by user so all local form state resets if the account changes. */}
      <div className="profile-layout" key={user.id}>
        <aside className="profile-layout__aside">
          <ProfileSummaryCard user={user} />
        </aside>

        <div className="profile-layout__main">
          <PersonalInfoCard user={user} />
          <ChangePasswordCard />
          <PreferencesCard />
          <SecurityActivityCard user={user} />
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
