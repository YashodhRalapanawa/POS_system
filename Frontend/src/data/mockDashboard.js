export const sidebarNav = {
  primary: [
    { label: 'Dashboard', active: true },
    { label: 'POS Register' },
    { label: 'Products' },
    { label: 'Categories' },
    { label: 'Suppliers' },
    { label: 'Inventory' },
    { label: 'Customers' },
    { label: 'Orders' },
    { label: 'Invoices' },
    { label: 'Returns' },
  ],
  secondary: ['Reports', 'Users', 'Settings'],
}

export const topbarActions = ['Store', 'Console', 'Reports']

export const kpiStats = [
  {
    label: 'Gross Store Revenue',
    value: '$14,892.40',
    delta: '+3.8%',
    trend: 'up',
    meta: 'vs. last week',
    tone: 'primary',
  },
  {
    label: 'Average Basket Value',
    value: '$52.44',
    delta: '+2.4%',
    trend: 'up',
    meta: 'today',
    tone: 'secondary',
  },
  {
    label: 'POS Registers Online',
    value: '4 of 4',
    delta: 'Online',
    trend: 'neutral',
    meta: 'all lanes active',
    tone: 'info',
  },
  {
    label: 'Inventory Alerts',
    value: '9 SKUs',
    delta: 'Critical',
    trend: 'down',
    meta: 'reorder review',
    tone: 'danger',
  },
]

export const quickActions = [
  { label: 'Lookup SKU', short: 'F4', icon: '⌕' },
  { label: 'Mgr Discount', short: 'F6', icon: '%' },
  { label: 'Gift Card Balance', short: 'F8', icon: '🎫' },
  { label: 'Price Check', short: 'F9', icon: '₨' },
  { label: 'Recall Ticket', short: 'F10', icon: '↩' },
]

export const transactions = [
  { id: '#VX-9824', time: '16:12:08', cashier: 'Sarah J.', lane: 'Lane #03', customer: 'Vance', items: 3, payment: 'Visa •••• 4692', amount: '$184.20', status: 'Paid' },
  { id: '#VX-9823', time: '16:09:44', cashier: 'Alex M.', lane: 'Lane #01', customer: 'Cash', items: 1, payment: 'Cash', amount: '$24.50', status: 'Paid' },
  { id: '#VX-9822', time: '16:04:19', cashier: 'Dave K.', lane: 'Lane #02', customer: 'Elena R.', items: 5, payment: 'Split • Cash + Card', amount: '$342.18', status: 'Paid' },
  { id: '#RT-4011', time: '15:58:33', cashier: 'Sarah J.', lane: 'Lane #03', customer: 'Chloe B.', items: 1, payment: 'Refund', amount: '-$79.99', status: 'Return' },
  { id: '#VX-9821', time: '15:52:20', cashier: 'Alex M.', lane: 'Lane #01', customer: 'Harri G.', items: 2, payment: 'Apple Pay', amount: '$68.75', status: 'Paid' },
  { id: '#VX-9819', time: '15:39:18', cashier: 'Dave K.', lane: 'Lane #02', customer: 'Devon M.', items: 2, payment: 'Visa •••• 1104', amount: '$94.00', status: 'Paid' },
]

export const stockAlerts = [
  { name: 'Sony WH-1000XM5', status: 'Low stock', qty: '2 left', delta: '+16', priority: 'watch' },
  { name: 'Thermal Pad...', status: 'Hot SKU', qty: '4 rolls', delta: '+50', priority: 'watch' },
  { name: 'Braided USB-C...', status: 'Backorder', qty: '1 left', delta: '-24', priority: 'watch' },
]

export const banner = {
  title: 'Store Operations Overview',
  subtitle: 'Store #104 Downtown Flagship',
  location: 'Scanner Ready (GOM)',
  shiftLabel: 'Shift Started',
  shiftTime: '08:00 AM',
  elapsed: '1h 14m elapsed',
}
