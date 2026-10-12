import { requireAuthAndPermission } from '../../../../lib/auth/authorize.js';
import { createInvoiceReader } from '../../../../lib/invoices/read.mjs';

export const dynamic = 'force-dynamic';
const read = createInvoiceReader(requireAuthAndPermission);
export async function GET(request, { params }) {
    const { id } = await params;
    return read(request, id);
}
