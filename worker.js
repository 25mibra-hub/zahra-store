// ZAHRA store worker: serves the static site + records orders + CSV download.
// Orders are stored in the ORDERS KV namespace (private to the store owner's Cloudflare account).
// CSV download is protected by a secret key in the URL (set as ORDER_KEY var/secret).

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function recordOrder(request, env) {
  let o;
  try { o = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const name = String(o.name || '').trim();
  const phone = String(o.phone || '').trim();
  if (!name || !phone) return new Response('name and phone required', { status: 400 });
  const rec = {
    name, phone,
    phone2: String(o.phone2 || ''),
    city: String(o.city || ''), address: String(o.address || ''), notes: String(o.notes || ''),
    items: Array.isArray(o.items) ? o.items.map(i => ({ name: String(i.name || ''), qty: Number(i.qty) || 0, price: Number(i.price) || 0 })) : [],
    total: Number(o.total) || 0,
    ts: o.ts || new Date().toISOString()
  };
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await env.ORDERS.put(id, JSON.stringify(rec));
  return Response.json({ ok: true });
}

async function downloadCsv(url, env) {
  if (!env.ORDER_KEY || url.searchParams.get('key') !== env.ORDER_KEY) {
    return new Response('not found', { status: 404 });
  }
  const list = await env.ORDERS.list();
  const rows = [['التاريخ', 'الاسم', 'الموبايل', 'موبايل إضافي', 'المحافظة/المدينة', 'العنوان', 'ملاحظات', 'الطلب', 'الإجمالي']];
  const recs = [];
  for (const k of list.keys) {
    const v = await env.ORDERS.get(k.name, 'json');
    if (v) recs.push(v);
  }
  recs.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  for (const r of recs) {
    const items = (r.items || []).map(i => `${i.name} × ${i.qty}`).join(' + ');
    rows.push([r.ts, r.name, r.phone, r.phone2 || '', r.city, r.address, r.notes, items, r.total]);
  }
  const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="zahra-orders.csv"'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/order' && request.method === 'POST') {
      return recordOrder(request, env);
    }
    if (url.pathname === '/orders.csv' && request.method === 'GET') {
      return downloadCsv(url, env);
    }
    return env.ASSETS.fetch(request);
  }
};
