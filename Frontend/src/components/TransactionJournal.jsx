import Card from './ui/Card'
import Badge from './ui/Badge'
import { transactions } from '../data/mockDashboard'

function TransactionJournal() {
  return (
    <Card title="Store Journal & Live Invoices" subtitle="Real-time synchronized across all registers" className="journal-card">
      <div className="journal-card__toolbar">
        <div className="journal-card__filter">
          <span className="journal-card__filter-label">Filter receipt...</span>
        </div>
      </div>

      <div className="journal-table">
        <div className="journal-table__head">
          <span>Order ID</span>
          <span>Time</span>
          <span>Cashier</span>
          <span>Lane</span>
          <span>Customer</span>
          <span>Items</span>
          <span>Payment</span>
          <span>Amount</span>
        </div>

        {transactions.map((transaction) => (
          <div key={transaction.id} className="journal-table__row">
            <span className="journal-table__id">{transaction.id}</span>
            <span>{transaction.time}</span>
            <span>{transaction.cashier}</span>
            <span>{transaction.lane}</span>
            <span>{transaction.customer}</span>
            <span>{transaction.items}</span>
            <span>{transaction.payment}</span>
            <div className="journal-table__amount-wrap">
              <span className="journal-table__amount">{transaction.amount}</span>
              <Badge tone={transaction.status === 'Return' ? 'danger' : 'success'}>{transaction.status}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default TransactionJournal
