import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoiceReader, formatInvoice } from '../lib/invoices/read.mjs';
const id = '11111111-1111-1111-1111-111111111111';
function setup(rows = [], error = null, user = { storeId: 'store-a' }) {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'or', 'gte', 'lt', 'order', 'range']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  function visible() { return rows.filter(row => calls.filter(c => c[0] === 'eq').every(([, key, value]) => row[key] === value)); }
  query.then = resolve => resolve({ data: visible(), count: visible().length, error });
  query.maybeSingle = async () => ({ data: visible()[0] || null, error });
  const read = createInvoiceReader(async (_request, permission) => {
    assert.equal(permission, 'invoices.view');
    return { authorized: true, user, client: { from: table => { assert.equal(table, 'invoices'); return query; } } };
  });
  return { read: (suffix = '', invoiceId) => read(new Request(`http://localhost/api/invoices${suffix}`), invoiceId), calls };
}
const row = { id, store_id: 'store-a', order_id: 'order-a', subtotal: '100', discount_amount: '10', tax_amount: '9', total_amount: '99', status: 'Pending', order: { currency_code: 'LKR', payments: [{payment_method:'Cash',payment_status:'Failed',amount:'99'}], order_items: [{ product_name: 'Historical name', unit_price: '100', quantity: 1, tax_rate: 10, tax_amount: 9, discount_amount: 10, line_total: 99 }] } };
test('unauthenticated and forbidden requests never reach the database', async () => {
  for (const status of [401, 403]) {
    const read = createInvoiceReader(async () => ({ authorized:false, response:Response.json({success:false},{status}) }));
    assert.equal((await read(new Request('http://localhost/api/invoices'))).status,status);
  }
});
test('missing store fails closed', async () => assert.equal((await setup([], null, {}).read()).status,403));
test('list isolates stores including privileged profiles', async () => {
  const {read,calls} = setup([row,{...row,id:'other',store_id:'store-b'}]);
  const response = await read('?page=1&limit=20');
  const json = await response.json();
  assert.equal(json.data.invoices.length,1);
  assert.equal(json.data.pagination.total,1);
  assert.ok(calls.some(c=>c[0]==='eq' && c[1]==='store_id' && c[2]==='store-a'));
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('foreign store invoice and unknown invoice are both 404',async()=>{
  assert.equal((await setup([{...row,store_id:'store-b'}]).read('',id)).status,404);
  assert.equal((await setup().read('',id)).status,404);
});
test('detail returns historical items and ignores failed payment',async()=>{
  const response=await setup([row]).read('',id);
  const invoice=(await response.json()).data.invoice;
  assert.equal(invoice.items[0].name,'Historical name');
  assert.equal(invoice.paymentStatus,'Pending');
  assert.equal(invoice.currencyCode,'LKR');
  assert.equal(invoice.total,99);
});
test('empty database is a successful empty page',async()=>{
  const response=await setup().read();
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).data.invoices,[]);
});
test('rejects malformed IDs, pagination, search grammar and dates',async()=>{
  assert.equal((await setup().read('','bad-id')).status,400);
  for(const params of ['page=0','limit=101','page=1.5','status=bad','customerType=bad','search=a,b','startDate=2026-02-30','startDate=2026-10-12&endDate=2026-10-01']) assert.equal((await setup().read('?'+params)).status,400,params);
});
test('filters and range are applied before pagination',async()=>{
  const {read,calls}=setup();
  await read('?page=2&limit=10&status=Paid&customerType=Business&search=INV-1&startDate=2026-10-01&endDate=2026-10-02');
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='status'&&c[2]==='Paid'));
  assert.ok(calls.some(c=>c[0]==='lt'&&c[2]==='2026-10-03T00:00:00.000Z'));
  assert.deepEqual(calls.at(-1),['range',10,19]);
});
test('database failure is not disguised as an empty success',async()=>{
  const response=await setup([], {message:'private database details'}).read();
  assert.equal(response.status,500);
  assert.ok(!(await response.text()).includes('private database details'));
});
test('mixed completed payments and partial payment are calculated correctly',()=>{
  const data=structuredClone(row);
  data.order.payments=[{payment_method:'Cash',payment_status:'Completed',amount:40},{payment_method:'Card',payment_status:'Completed',amount:59}];
  assert.equal(formatInvoice(data).paymentMethod,'Mixed');
  assert.equal(formatInvoice(data).paymentStatus,'Paid');
  data.order.payments.pop();
  assert.equal(formatInvoice(data).paymentStatus,'Partial');
});
