// NOTE: `authUsers` (bottom of this file) holds DEMO CREDENTIALS ONLY for the
// frontend login mock. It will be replaced by backend authentication.

export const userRoles = [
  'Administrator',
  'Manager',
  'Cashier',
  'Inventory Clerk',
  'Accountant',
]

export const userStatusOptions = ['All Status', 'Active', 'Inactive']

export const userRegisterFilterOptions = [
  'All Registers',
  'None',
  'Register #01',
  'Register #02',
  'Register #03',
  'Register #04',
]

export const mockUsers = [
  {
    id: 'USR-001',
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@vantrix.local',
    employeeId: 'EMP-001',
    role: 'Manager',
    registerAccess: 'Register #03',
    lastLogin: '2026-09-23T08:42:00.000Z',
    status: 'Active',
    createdAt: '2024-01-10T09:00:00.000Z',
  },
  {
    id: 'USR-002',
    name: 'David Perera',
    email: 'david.perera@vantrix.local',
    employeeId: 'EMP-002',
    role: 'Cashier',
    registerAccess: 'Register #01',
    lastLogin: '2026-09-24T14:20:00.000Z',
    status: 'Active',
    createdAt: '2024-02-15T08:30:00.000Z',
  },
  {
    id: 'USR-003',
    name: 'Nadeesha Silva',
    email: 'nadeesha.silva@vantrix.local',
    employeeId: 'EMP-003',
    role: 'Cashier',
    registerAccess: 'Register #02',
    lastLogin: '2026-09-24T11:10:00.000Z',
    status: 'Active',
    createdAt: '2024-03-04T10:15:00.000Z',
  },
  {
    id: 'USR-004',
    name: 'Kasun Fernando',
    email: 'kasun.fernando@vantrix.local',
    employeeId: 'EMP-004',
    role: 'Inventory Clerk',
    registerAccess: 'None',
    lastLogin: '2026-09-22T16:40:00.000Z',
    status: 'Active',
    createdAt: '2024-04-18T11:45:00.000Z',
  },
  {
    id: 'USR-005',
    name: 'Ruwan Fernando',
    email: 'ruwan.fernando@vantrix.local',
    employeeId: 'EMP-005',
    role: 'Accountant',
    registerAccess: 'None',
    lastLogin: '2026-09-23T12:15:00.000Z',
    status: 'Active',
    createdAt: '2024-05-08T13:20:00.000Z',
  },
  {
    id: 'USR-006',
    name: 'Amaya Perera',
    email: 'amaya.perera@vantrix.local',
    employeeId: 'EMP-006',
    role: 'Cashier',
    registerAccess: 'Register #04',
    lastLogin: '2026-09-11T09:50:00.000Z',
    status: 'Inactive',
    createdAt: '2024-06-12T07:50:00.000Z',
  },
  {
    id: 'USR-007',
    name: 'Admin User',
    email: 'admin@vantrix.local',
    employeeId: 'EMP-007',
    role: 'Administrator',
    registerAccess: 'All Registers',
    lastLogin: '2026-09-24T07:05:00.000Z',
    status: 'Active',
    createdAt: '2023-12-05T08:00:00.000Z',
  },
]

export const usersRoleOptions = ['All Roles', ...userRoles]
export const usersStatusOptions = ['All Status', 'Active', 'Inactive']
export const usersRegisterOptions = ['All Registers', 'None', 'Register #01', 'Register #02', 'Register #03', 'Register #04']

// Default POS preferences for a staff account (see the My Profile screen).
export const defaultUserPreferences = {
  landingPage: '/dashboard',
  dateFormat: 'MMM D, YYYY',
  askBeforePrinting: true,
  saleSound: true,
  tableDensity: 'comfortable',
}

// ---------------------------------------------------------------------------
// Demo login accounts — DEMO CREDENTIALS ONLY, will be replaced by backend auth.
// `demoPassword` is a plaintext demo-only value and must never be used for real
// accounts. Ids match the staff records in `mockUsers` above.
// ---------------------------------------------------------------------------
export const authUsers = [
  {
    id: 'USR-007',
    employeeCode: 'EMP-007',
    fullName: 'Admin User',
    email: 'admin@vantrix.local',
    username: 'admin',
    role: 'Admin',
    status: 'Active',
    storeName: 'Vantrix Colombo Main',
    lastLogin: '2026-09-24T07:05:00.000Z',
    phone: '+94 77 100 2007',
    memberSince: '2023-12-05T08:00:00.000Z',
    avatarUrl: null,
    preferences: { ...defaultUserPreferences },
    demoPassword: 'demo1234',
  },
  {
    id: 'USR-001',
    employeeCode: 'EMP-001',
    fullName: 'Sarah Jenkins',
    email: 'sarah.jenkins@vantrix.local',
    username: 'sarah.j',
    role: 'Manager',
    status: 'Active',
    storeName: 'Vantrix Colombo Main',
    lastLogin: '2026-09-23T08:42:00.000Z',
    phone: '+94 77 120 4501',
    memberSince: '2024-01-10T09:00:00.000Z',
    avatarUrl: null,
    preferences: { ...defaultUserPreferences },
    demoPassword: 'demo1234',
  },
  {
    id: 'USR-002',
    employeeCode: 'EMP-002',
    fullName: 'David Perera',
    email: 'david.perera@vantrix.local',
    username: 'david.p',
    role: 'Cashier',
    status: 'Active',
    storeName: 'Vantrix Colombo Main',
    lastLogin: '2026-09-24T14:20:00.000Z',
    phone: '+94 71 330 8812',
    memberSince: '2024-02-15T08:30:00.000Z',
    avatarUrl: null,
    preferences: { ...defaultUserPreferences },
    demoPassword: 'demo1234',
  },
  {
    id: 'USR-003',
    employeeCode: 'EMP-003',
    fullName: 'Nadeesha Silva',
    email: 'nadeesha.silva@vantrix.local',
    username: 'nadeesha.s',
    role: 'Cashier',
    status: 'Active',
    storeName: 'Vantrix Colombo Main',
    lastLogin: '2026-09-24T11:10:00.000Z',
    phone: '+94 76 455 2190',
    memberSince: '2024-03-04T10:15:00.000Z',
    avatarUrl: null,
    preferences: { ...defaultUserPreferences },
    demoPassword: 'demo1234',
  },
  {
    id: 'USR-006',
    employeeCode: 'EMP-006',
    fullName: 'Amaya Perera',
    email: 'amaya.perera@vantrix.local',
    username: 'amaya.p',
    role: 'Cashier',
    status: 'Inactive',
    storeName: 'Vantrix Colombo Main',
    lastLogin: '2026-09-11T09:50:00.000Z',
    phone: '',
    memberSince: '2024-06-12T07:50:00.000Z',
    avatarUrl: null,
    preferences: { ...defaultUserPreferences },
    demoPassword: 'demo1234',
  },
]
