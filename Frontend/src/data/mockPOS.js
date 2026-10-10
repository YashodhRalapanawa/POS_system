export const mockProducts = [
  {
    id: 'prod-sony-wh1000',
    name: 'Sony WH-1000XM5',
    sku: 'SONY-WH-1000XM5',
    barcode: '4548736134975',
    price: 349.99,
    stock: 12,
    taxRate: 0.15,
    category: 'Audio',
  },
  {
    id: 'prod-thermal-paper',
    name: 'Thermal Paper Roll',
    sku: 'POS-THERMAL-01',
    barcode: '8901234567890',
    price: 8.5,
    stock: 42,
    taxRate: 0.15,
    category: 'Supplies',
  },
  {
    id: 'prod-usb-cable',
    name: 'Braided USB-C Cable',
    sku: 'USB-C-BRAID-02',
    barcode: '8901234567891',
    price: 14.99,
    stock: 8,
    taxRate: 0.15,
    category: 'Accessories',
  },
  {
    id: 'prod-logitech-mx',
    name: 'Logitech MX Master 3',
    sku: 'LOGI-MX3-01',
    barcode: '8901234567892',
    price: 99.99,
    stock: 6,
    taxRate: 0.15,
    category: 'Peripherals',
  },
  {
    id: 'prod-lamp',
    name: 'Desk LED Lamp',
    sku: 'LED-DESK-07',
    barcode: '8901234567893',
    price: 29.5,
    stock: 15,
    taxRate: 0.15,
    category: 'Office',
  },
]

export const mockCustomers = [
  {
    id: 'cust-walkin',
    name: 'Walk-in Customer',
    phone: 'N/A',
    email: 'walkin@vantrix.local',
  },
  {
    id: 'cust-1',
    name: 'Sarah Johnson',
    phone: '+1 (415) 555-0188',
    email: 'sarah.johnson@email.com',
  },
  {
    id: 'cust-2',
    name: 'David Patel',
    phone: '+1 (415) 555-0199',
    email: 'david.patel@email.com',
  },
]

export const paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Other']

export const productCategories = ['All', 'Audio', 'Accessories', 'Peripherals', 'Office', 'Supplies']

export const keyShortcuts = [
  'F2 — New Sale',
  'F4 — Lookup SKU',
  'F6 — Manager Discount',
  'F8 — Gift Card',
  'F9 — Price Check',
  'F10 — Recall Ticket',
]
