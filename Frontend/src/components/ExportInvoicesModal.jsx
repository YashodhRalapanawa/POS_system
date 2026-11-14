import { useState } from 'react'
import Button from './ui/Button'
import Badge from './ui/Badge'
import { useCurrency } from '../context/CurrencyContext'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function ExportInvoicesModal({ invoices = [], onClose, activeFilters = {} }) {
  const { formatCurrency } = useCurrency()
  const [exportType, setExportType] = useState('all') // 'all' | 'filtered'

  const targetInvoices = exportType === 'filtered' ? (activeFilters.filteredInvoices || invoices) : invoices

  const totalCount = targetInvoices.length
  const totalAmount = targetInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0)
  const paidCount = targetInvoices.filter((inv) => inv.status === 'Paid').length
  const pendingCount = targetInvoices.filter((inv) => ['Pending', 'Overdue'].includes(inv.status)).length
  const otherCount = totalCount - paidCount - pendingCount

  // CSV Export Handler
  const handleDownloadCSV = () => {
    if (targetInvoices.length === 0) {
      alert('No invoices available to export.')
      return
    }

    const headers = [
      'Invoice Number',
      'Order ID',
      'Customer Name',
      'Customer Code',
      'Customer Phone',
      'Customer Email',
      'Invoice Date',
      'Due Date',
      'Subtotal',
      'Discount',
      'Tax',
      'Total Amount',
      'Payment Method',
      'Payment Status',
      'Status',
    ]

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    const rows = targetInvoices.map((inv) => [
      escapeCsv(inv.invoiceNumber),
      escapeCsv(inv.orderId || inv.orderNumber || ''),
      escapeCsv(inv.customerName || 'Walk-in Customer'),
      escapeCsv(inv.customerCode || ''),
      escapeCsv(inv.customerPhone || ''),
      escapeCsv(inv.customerEmail || ''),
      escapeCsv(inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split('T')[0] : ''),
      escapeCsv(inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : ''),
      escapeCsv(Number(inv.subtotal || 0).toFixed(2)),
      escapeCsv(Number(inv.discount || inv.discountAmount || 0).toFixed(2)),
      escapeCsv(Number(inv.tax || inv.taxAmount || 0).toFixed(2)),
      escapeCsv(Number(inv.total || 0).toFixed(2)),
      escapeCsv(inv.paymentMethod || 'Cash'),
      escapeCsv(inv.paymentStatus || inv.status || 'Paid'),
      escapeCsv(inv.status || 'Paid'),
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Vantrix_Invoices_Report_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Print / PDF Beautiful Report Handler
  const handlePrintReport = () => {
    if (targetInvoices.length === 0) {
      alert('No invoices available to print.')
      return
    }

    const printWindow = window.open('', '_blank', 'width=1000,height=800')
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print or export PDF reports.')
      return
    }

    const generatedOn = formatDateTime(new Date())
    const tableRowsHtml = targetInvoices.map((inv, idx) => `
      <tr>
        <td style="text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
        <td>
          <strong style="color: #0f172a; font-family: monospace; font-size: 13px;">${inv.invoiceNumber}</strong>
          <div style="color: #64748b; font-size: 11px;">${inv.orderId || inv.orderNumber || ''}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: #1e293b;">${inv.customerName || 'Walk-in Customer'}</div>
          <div style="color: #64748b; font-size: 11px;">${inv.customerCode || 'CUS-001'}</div>
        </td>
        <td style="font-size: 12px; color: #334155; white-space: nowrap;">${formatDate(inv.invoiceDate)}</td>
        <td style="font-size: 12px; color: #334155; white-space: nowrap;">${formatDate(inv.dueDate)}</td>
        <td style="font-size: 12px; color: #334155;">${inv.paymentMethod || 'Cash'}</td>
        <td style="text-align: center;">
          <span class="badge badge-${String(inv.status).toLowerCase()}">${inv.status}</span>
        </td>
        <td style="text-align: right; font-weight: 700; color: #0f172a; font-size: 13px;">
          ${formatCurrency(inv.total)}
        </td>
      </tr>
    `).join('')

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Vantrix POS - Invoices Summary Report</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm 12mm 15mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 24px;
            font-size: 13px;
            line-height: 1.5;
          }
          .header-banner {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 18px;
            margin-bottom: 20px;
          }
          .brand-title {
            font-size: 24px;
            font-weight: 800;
            color: #1e40af;
            letter-spacing: -0.02em;
            margin: 0;
          }
          .brand-sub {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 600;
            margin-top: 4px;
          }
          .report-meta {
            text-align: right;
            font-size: 12px;
            color: #475569;
          }
          .report-meta strong {
            font-size: 15px;
            color: #0f172a;
            display: block;
            margin-bottom: 3px;
          }
          .kpi-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }
          .kpi-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 14px;
          }
          .kpi-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            font-weight: 600;
            margin-bottom: 4px;
          }
          .kpi-val {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
          }
          .kpi-box.highlight {
            background: #eff6ff;
            border-color: #bfdbfe;
          }
          .kpi-box.highlight .kpi-val {
            color: #1d4ed8;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          th {
            background: #f1f5f9;
            color: #475569;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-weight: 700;
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid #cbd5e1;
          }
          td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background: #fafafa;
          }
          .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 600;
            text-transform: capitalize;
          }
          .badge-paid {
            background: #dcfce7;
            color: #15803d;
          }
          .badge-pending, .badge-overdue {
            background: #fef3c7;
            color: #b45309;
          }
          .badge-cancelled, .badge-refunded {
            background: #fee2e2;
            color: #b91c1c;
          }
          .totals-bar {
            display: flex;
            justify-content: flex-end;
            margin-top: 10px;
            padding: 14px 18px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
          }
          .totals-content {
            text-align: right;
          }
          .totals-content span {
            font-size: 13px;
            color: #64748b;
            margin-right: 12px;
          }
          .totals-content strong {
            font-size: 18px;
            color: #0f172a;
          }
          .report-footer {
            margin-top: 32px;
            padding-top: 14px;
            border-top: 1px dashed #cbd5e1;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #94a3b8;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="header-banner">
          <div>
            <h1 class="brand-title">VANTRIX POS</h1>
            <div class="brand-sub">Billing & Receivables • Invoice Executive Report</div>
          </div>
          <div class="report-meta">
            <strong>Invoices Summary Report</strong>
            <div>Generated: ${generatedOn}</div>
            <div>Records Included: ${totalCount}</div>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-box">
            <div class="kpi-label">Total Invoices</div>
            <div class="kpi-val">${totalCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Paid Invoices</div>
            <div class="kpi-val" style="color: #16a34a;">${paidCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Pending / Overdue</div>
            <div class="kpi-val" style="color: #d97706;">${pendingCount}</div>
          </div>
          <div class="kpi-box highlight">
            <div class="kpi-label">Total Revenue</div>
            <div class="kpi-val">${formatCurrency(totalAmount)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th>Invoice & Order</th>
              <th>Customer</th>
              <th>Invoice Date</th>
              <th>Due Date</th>
              <th>Payment</th>
              <th style="text-align: center;">Status</th>
              <th style="text-align: right;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div class="totals-bar">
          <div class="totals-content">
            <span>Grand Total (${totalCount} Invoices):</span>
            <strong>${formatCurrency(totalAmount)}</strong>
          </div>
        </div>

        <div class="report-footer">
          <div>CONFIDENTIAL • Internal Business Records</div>
          <div>Page 1 of 1 • Generated by Vantrix Enterprise POS</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 350);
          };
        </script>
      </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal export-invoices-modal"
        style={{ width: 'min(640px, calc(100vw - 32px))' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="section-label">Report Generation</span>
            <h3>Export Invoices Report</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px 0' }}>
          {/* Scope Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--on-surface-variant)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Data Scope
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setExportType('all')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: exportType === 'all' ? '2px solid var(--primary, #2563eb)' : '1px solid rgba(116, 118, 134, 0.2)',
                  background: exportType === 'all' ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: '0.9rem' }}>All Invoices</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)', marginTop: '2px' }}>
                  {invoices.length} total recorded invoices
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportType('filtered')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: exportType === 'filtered' ? '2px solid var(--primary, #2563eb)' : '1px solid rgba(116, 118, 134, 0.2)',
                  background: exportType === 'filtered' ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: '0.9rem' }}>Current View (Filtered)</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)', marginTop: '2px' }}>
                  {(activeFilters.filteredInvoices || invoices).length} matching current filters
                </div>
              </button>
            </div>
          </div>

          {/* Report Summary Card */}
          <div
            style={{
              background: 'rgba(239, 244, 255, 0.65)',
              border: '1px solid rgba(37, 99, 235, 0.2)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary, #2563eb)' }}>
                Report Preview Summary
              </span>
              <Badge tone="success">{paidCount} Paid</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>Total Records</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--on-surface)' }}>{totalCount}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>Pending / Due</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--on-surface)' }}>{pendingCount}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>Total Value</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary, #2563eb)' }}>
                  {formatCurrency(totalAmount)}
                </div>
              </div>
            </div>
          </div>

          {/* Export Formats */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--on-surface-variant)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Choose Export Output
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'rgba(248, 250, 252, 0.9)',
                  border: '1px solid rgba(116, 118, 134, 0.15)',
                  borderRadius: 'var(--radius-md, 8px)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: '0.9rem' }}>
                    Print / PDF Document (Beautiful Layout)
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)' }}>
                    Styled executive PDF ready for printing, archiving, or sharing.
                  </div>
                </div>
                <Button variant="primary" type="button" onClick={handlePrintReport}>
                  Print / Save PDF
                </Button>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'rgba(248, 250, 252, 0.9)',
                  border: '1px solid rgba(116, 118, 134, 0.15)',
                  borderRadius: 'var(--radius-md, 8px)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: '0.9rem' }}>
                    CSV / Excel Spreadsheet
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)' }}>
                    Raw invoice dataset formatted for Microsoft Excel and accounting tools.
                  </div>
                </div>
                <Button variant="secondary" type="button" onClick={handleDownloadCSV}>
                  Download CSV
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal__actions" style={{ marginTop: '12px' }}>
          <Button variant="secondary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

