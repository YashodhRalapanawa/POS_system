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
