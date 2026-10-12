const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status) => reply({ success: false, message }, status);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = ['Paid', 'Pending', 'Overdue', 'Cancelled', 'Refunded'];
const fields = 'id,store_id,order_id,invoice_number,invoice_date,due_date,customer_name,customer_code,customer_type,customer_phone,customer_email,customer_address,subtotal,discount_amount,tax_amount,total_amount,status';

export function formatInvoice(row) {
  const order = row.order || {};
  const payments = (order.payments || []).filter(p => p.payment_status === 'Completed');
  const methods = [...new Set(payments.map(p => p.payment_method))];
  const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return {
    id: row.id, orderId: row.order_id, orderNumber: order.order_number || row.order_id,
    invoiceNumber: row.invoice_number, invoiceDate: row.invoice_date, dueDate: row.due_date,
    customerName: row.customer_name, customerCode: row.customer_code, customerType: row.customer_type,
    customerPhone: row.customer_phone, customerEmail: row.customer_email, customerAddress: row.customer_address,
    status: row.status, currencyCode: order.currency_code || order.currency || null,
    subtotal: Number(row.subtotal), discount: Number(row.discount_amount), tax: Number(row.tax_amount), total: Number(row.total_amount),
    paymentMethod: methods.length > 1 ? 'Mixed' : methods[0] || '—', paidAmount,
    paymentStatus: row.status === 'Refunded' ? 'Refunded' : payments.length && paidAmount >= Number(row.total_amount) ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending',
    items: (order.order_items || []).map(item => ({
      id: item.id, name: item.product_name, sku: item.sku, quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price), taxRate: Number(item.tax_rate), tax: Number(item.tax_amount),
      discount: Number(item.discount_amount), lineTotal: Number(item.line_total),
    })),
  };
}

// Dependency injection keeps permission failures and database errors testable without live credentials.
export function createInvoiceReader(authorize) {
  return async function read(request, id) {
    try {
      const auth = await authorize(request, 'invoices.view');
      if (!auth.authorized) return auth.response;
      const storeId = auth.user.storeId;
      if (!storeId) return fail('No store is assigned to this account.', 403);
      if (id !== undefined && !uuid.test(id)) return fail('Invalid invoice ID.', 400);
      const params = new URL(request.url).searchParams;
      const page = Number(params.get('page') || 1);
      const limit = Number(params.get('limit') || 20);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) return fail('Invalid pagination.', 400);
      const status = params.get('status');
      const type = params.get('customerType');
      if (status && !statuses.includes(status)) return fail('Invalid invoice status.', 400);
      if (type && !['Individual', 'Business'].includes(type)) return fail('Invalid customer type.', 400);
      const search = (params.get('search') || '').trim();
      if (search.length > 100 || (search && !/^[\p{L}\p{N}\s@+._-]+$/u.test(search))) return fail('Search contains unsupported characters.', 400);
      const start = params.get('startDate');
      const end = params.get('endDate');
      for (const date of [start, end]) {
        if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) return fail('Dates must be valid YYYY-MM-DD values.', 400);
      }
      if (start && end && start > end) return fail('Start date must not follow end date.', 400);
      const items = id ? ',order_items(id,product_name,sku,quantity,unit_price,tax_rate,tax_amount,discount_amount,line_total)' : '';
      // User-scoped client applies RLS; explicit store constraint also applies to Admin users.
      let query = auth.client.from('invoices').select(`${fields},order:orders(order_number,currency_code,currency,payments(payment_method,payment_status,amount)${items})`, { count: 'exact' }).eq('store_id', storeId);
      if (id) {
        const { data, error } = await query.eq('id', id).maybeSingle();
        if (error) return fail('Unable to load invoice.', 500);
        if (!data) return fail('Invoice not found.', 404);
        return reply({ success: true, data: { invoice: formatInvoice(data) } });
      }
      if (status) query = query.eq('status', status);
      if (type) query = query.eq('customer_type', type);
      if (search) {
        const term = search.replaceAll('_', '\\_');
        query = query.or(`invoice_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_code.ilike.%${term}%`);
      }
      if (start) query = query.gte('invoice_date', `${start}T00:00:00.000Z`);
      if (end) query = query.lt('invoice_date', new Date(Date.parse(end) + 86400000).toISOString());
      const { data, count, error } = await query.order('invoice_date', { ascending: false }).order('id', { ascending: false }).range((page - 1) * limit, page * limit - 1);
      if (error) return fail('Unable to load invoices.', 500);
      return reply({ success: true, data: { invoices: (data || []).map(formatInvoice), pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) } } });
    } catch {
      return fail('Unable to load invoices.', 500);
    }
  };
}
