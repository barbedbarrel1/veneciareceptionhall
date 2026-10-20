// ============================================================
// VENECIA — admin.js
// Sections: auth · tabs · toast/modal helpers · dashboard ·
// clients + payments · inquiries · settings (packages, gallery)
// ============================================================

const loginScreen = document.getElementById('loginScreen');
const app = document.getElementById('app');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

/* ---------------- auth ---------------- */
async function boot() {
  if (!db) {
    loginError.textContent = 'Supabase is not configured yet — add your project URL and anon key to config.js.';
    return;
  }
  const { data: { session } } = await db.auth.getSession();
  if (session) showApp(session); else showLogin();
}

function showLogin() {
  loginScreen.style.display = 'flex';
  app.style.display = 'none';
}

function showApp(session) {
  loginScreen.style.display = 'none';
  app.style.display = 'block';
  document.getElementById('userGreeting').textContent = 'Hola, ' + (session.user.email || '').split('@')[0];
  loadDashboard();
  refreshInqBadge();
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  const submitBtn = loginForm.querySelector('button[type=submit]');
  submitBtn.disabled = true;

  const { data, error } = await db.auth.signInWithPassword({
    email: document.getElementById('loginEmail').value.trim(),
    password: document.getElementById('loginPassword').value
  });

  submitBtn.disabled = false;
  if (error) { loginError.textContent = 'Incorrect email or password.'; return; }
  showApp(data.session);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await db.auth.signOut();
  showLogin();
});

boot();

/* ---------------- tabs ---------------- */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + tab.dataset.view).classList.add('active');

    if (tab.dataset.view === 'dashboard') loadDashboard();
    if (tab.dataset.view === 'clients') loadClients();
    if (tab.dataset.view === 'inquiries') loadInquiries();
    if (tab.dataset.view === 'settings') { loadPackagesAdmin(); loadGalleryAdmin(); loadVideosAdmin(); }
  });
});

/* ---------------- toast + modal helpers ---------------- */
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalBg').classList.add('open');
  const cancel = document.getElementById('modalCancel');
  if (cancel) cancel.addEventListener('click', closeModal);
}
function closeModal() {
  document.getElementById('modalBg').classList.remove('open');
  document.getElementById('modalContent').innerHTML = '';
}
document.getElementById('modalBg').addEventListener('click', e => {
  if (e.target.id === 'modalBg') closeModal();
});

/* ---------------- formatting helpers ---------------- */
function money(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// event_date/paid_at come back as 'YYYY-MM-DD' — parse as local time to avoid a day-early shift
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const EVENT_TYPES = { wedding: 'Wedding', quinceanera: 'Quinceañera', sweet16: 'Sweet 16', baptism: 'Baptism', graduation: 'Graduation', other: 'Other' };
function eventTypeLabel(t) { return EVENT_TYPES[t] || (t || '—'); }

function clientStatusPill(status) {
  const map = { active: 'new', completed: 'paid', cancelled: 'muted' };
  return `<span class="pill ${map[status] || 'muted'}">${status}</span>`;
}
function inqStatusPill(status) {
  const map = { new: 'new', contacted: 'partial', booked: 'paid', lost: 'muted' };
  return `<span class="pill ${map[status] || 'muted'}">${status}</span>`;
}
function balancePill(row) {
  if (Number(row.balance_owed) <= 0) return `<span class="pill paid">Paid</span>`;
  if (Number(row.total_paid) > 0) return `<span class="pill partial">${money(row.balance_owed)} owed</span>`;
  return `<span class="pill due">${money(row.balance_owed)} owed</span>`;
}

/* ---------------- dashboard ---------------- */
async function loadDashboard() {
  const { data: balances, error: balErr } = await db.from('client_balances').select('*');
  const { data: payments, error: payErr } = await db.from('payments').select('amount, paid_at, type');
  if (balErr || payErr) { toast('Could not load dashboard data.'); return; }

  const rows = balances || [];
  // credits don't move real cash (README: "no cash changed hands") — exclude them from collected totals
  const pays = (payments || []).filter(p => p.type !== 'credit');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const collectedMonth = pays.filter(p => new Date(p.paid_at) >= monthStart).reduce((s, p) => s + Number(p.amount), 0);
  const collectedYear = pays.filter(p => new Date(p.paid_at) >= yearStart).reduce((s, p) => s + Number(p.amount), 0);
  const active = rows.filter(r => r.status === 'active');
  // money still coming in from booked events that haven't happened yet
  const projected = active
    .filter(r => r.event_date && new Date(r.event_date + 'T00:00:00') >= now)
    .reduce((s, r) => s + Math.max(0, Number(r.balance_owed)), 0);
  const outstanding = active.reduce((s, r) => s + Math.max(0, Number(r.balance_owed)), 0);

  document.getElementById('statMonth').textContent = money(collectedMonth);
  document.getElementById('statYear').textContent = money(collectedYear);
  document.getElementById('statProjected').textContent = money(projected);
  document.getElementById('statOutstanding').textContent = money(outstanding);

  const CAPACITY = 20;
  const bookedThisMonth = active.filter(r => {
    if (!r.event_date) return false;
    const d = new Date(r.event_date + 'T00:00:00');
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  document.getElementById('capCount').textContent = `${bookedThisMonth} of ${CAPACITY} dates booked`;
  document.getElementById('capFill').style.width = Math.min(100, (bookedThisMonth / CAPACITY) * 100) + '%';

  const soon = active
    .filter(r => r.event_date && Number(r.balance_owed) > 0)
    .map(r => ({ ...r, daysAway: Math.ceil((new Date(r.event_date + 'T00:00:00') - now) / 86400000) }))
    .filter(r => r.daysAway >= 0 && r.daysAway <= 30)
    .sort((a, b) => a.daysAway - b.daysAway);

  document.getElementById('attnList').innerHTML = soon.length
    ? soon.map(r => `
      <div class="card attn-item ${r.daysAway <= 7 ? 'urgent' : ''}">
        <div><div class="who">${r.name}</div><div class="when">${fmtDate(r.event_date)} · ${r.daysAway}d away</div></div>
        <div class="owes">${money(r.balance_owed)}<div class="of">owed</div></div>
      </div>`).join('')
    : '<div class="card empty">Nothing needs attention right now.</div>';

  const upcoming = active
    .filter(r => r.event_date && new Date(r.event_date + 'T00:00:00') >= now)
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
    .slice(0, 10);

  document.getElementById('upcomingList').innerHTML = upcoming.length
    ? upcoming.map(r => `
      <div class="upcoming-row">
        <span class="date">${fmtDate(r.event_date)}</span>
        <span>${r.name} — ${eventTypeLabel(r.event_type)}</span>
        ${balancePill(r)}
      </div>`).join('')
    : '<div class="empty">No upcoming events.</div>';
}

/* ---------------- clients + payments ---------------- */
let allClients = [];

async function loadClients() {
  const { data, error } = await db.from('client_balances').select('*').order('event_date', { ascending: true });
  if (error) { toast('Could not load clients.'); return; }
  allClients = data || [];
  renderClients();
}

function renderClients() {
  const search = document.getElementById('clientSearch').value.trim().toLowerCase();
  const statusFilter = document.getElementById('clientStatusFilter').value;
  let rows = allClients;
  if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
  if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search) || (r.phone || '').includes(search));

  const tbody = document.getElementById('clientRows');
  const empty = document.getElementById('clientsEmpty');
  if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td>${r.name}</td>
      <td>${eventTypeLabel(r.event_type)}</td>
      <td>${fmtDate(r.event_date)}</td>
      <td class="num">${money(r.contract_price)}</td>
      <td class="num">${money(r.total_paid)}</td>
      <td class="num"><span class="owed ${Number(r.balance_owed) <= 0 ? 'zero' : ''}">${money(r.balance_owed)}</span></td>
      <td>${clientStatusPill(r.status)}</td>
    </tr>`).join('');

  tbody.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => openClientDetail(tr.dataset.id)));
}

document.getElementById('clientSearch').addEventListener('input', renderClients);
document.getElementById('clientStatusFilter').addEventListener('change', renderClients);
document.getElementById('newClientBtn').addEventListener('click', () => openClientForm(null, false));

async function openClientDetail(id) {
  const { data: client, error } = await db.from('clients').select('*').eq('id', id).single();
  if (error || !client) { toast('Could not load client.'); return; }
  openClientForm(client, true);
}

async function openClientForm(client, isEdit) {
  const { data: pkgs } = await db.from('packages').select('id,name,base_price').order('sort_order');

  openModal(`
    <h3>${isEdit ? 'Edit client' : 'New client'}</h3>
    <form id="clientForm">
      <div class="row2">
        <div class="field"><label>Name</label><input name="name" required value="${client?.name || ''}"></div>
        <div class="field"><label>Phone</label><input name="phone" required value="${client?.phone || ''}"></div>
      </div>
      <div class="field"><label>Email</label><input type="email" name="email" value="${client?.email || ''}"></div>
      <div class="row2">
        <div class="field"><label>Event type</label>
          <select name="event_type">
            ${Object.entries(EVENT_TYPES).map(([v, l]) => `<option value="${v}" ${client?.event_type === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Event date</label><input type="date" name="event_date" required value="${client?.event_date || ''}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Package</label>
          <select name="package_id">
            <option value="">— none —</option>
            ${(pkgs || []).map(p => `<option value="${p.id}" ${client?.package_id === p.id ? 'selected' : ''}>${p.name} (${money(p.base_price)})</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Contract price</label><input type="number" step="0.01" name="contract_price" required value="${client?.contract_price ?? ''}"></div>
      </div>
      <div class="field"><label>Status</label>
        <select name="status">
          ${['active', 'completed', 'cancelled'].map(v => `<option value="${v}" ${client?.status === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes" rows="2">${client?.notes || ''}</textarea></div>
      ${!isEdit ? `
      <div class="row2">
        <div class="field"><label>Deposit taken today (optional)</label><input type="number" step="0.01" name="deposit_amount" placeholder="0.00"></div>
        <div class="field"><label>Deposit method</label>
          <select name="deposit_method"><option>cash</option><option>zelle</option><option>card</option><option>check</option></select>
        </div>
      </div>` : ''}
      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn btn-outline btn-sm" id="viewPaymentsBtn">Payments</button>' : ''}
        ${isEdit ? '<button type="button" class="btn btn-outline btn-sm" id="printInvoiceBtn">🖨 Invoice</button>' : ''}
        <button type="button" class="btn btn-outline" id="modalCancel">Cancel</button>
        <button type="submit" class="btn btn-teal">${isEdit ? 'Save changes' : 'Add client'}</button>
      </div>
    </form>
  `);

  const form = document.getElementById('clientForm');

  // pre-fill contract price from the chosen package (new clients only)
  form.package_id.addEventListener('change', () => {
    if (isEdit) return;
    const pkg = (pkgs || []).find(p => p.id === form.package_id.value);
    if (pkg) form.contract_price.value = pkg.base_price;
  });

  if (isEdit) {
    document.getElementById('viewPaymentsBtn').addEventListener('click', () => openPayments(client));
    document.getElementById('printInvoiceBtn').addEventListener('click', () => printInvoice(client.id));
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim() || null,
      event_type: form.event_type.value,
      event_date: form.event_date.value,
      package_id: form.package_id.value || null,
      contract_price: parseFloat(form.contract_price.value),
      status: form.status.value,
      notes: form.notes.value.trim() || null
    };

    if (isEdit) {
      const { error } = await db.from('clients').update(payload).eq('id', client.id);
      if (error) { toast('Could not save client.'); return; }
      toast('Client updated.');
    } else {
      const { data: inserted, error } = await db.from('clients').insert(payload).select().single();
      if (error) { toast('Could not add client.'); return; }

      const depositAmount = parseFloat(form.deposit_amount?.value || 0);
      if (depositAmount > 0) {
        await db.from('payments').insert({
          client_id: inserted.id,
          amount: depositAmount,
          type: 'deposit',
          method: form.deposit_method.value,
          note: 'Deposit at booking'
        });
      }

      if (client?._fromInquiry) {
        await db.from('inquiries').update({ converted_client_id: inserted.id, status: 'booked' }).eq('id', client._fromInquiry);
        refreshInqBadge();
      }
      toast('Client added.');
    }
    closeModal();
    loadClients();
    loadDashboard();
  });
}

async function openPayments(client) {
  const { data: pays } = await db.from('payments').select('*').eq('client_id', client.id).order('paid_at', { ascending: false });
  const { data: balRow } = await db.from('client_balances').select('total_paid,balance_owed').eq('id', client.id).single();

  openModal(`
    <h3>${client.name} — payments</h3>
    <div class="detail-stats">
      <div class="card stat"><div class="label">Contract</div><div class="value">${money(client.contract_price)}</div></div>
      <div class="card stat"><div class="label">Paid</div><div class="value">${money(balRow?.total_paid)}</div></div>
      <div class="card stat"><div class="label">Owes</div><div class="value warn">${money(balRow?.balance_owed)}</div></div>
    </div>
    <div id="payRows">
      ${(pays || []).length ? pays.map(p => `
        <div class="pay-row">
          <span>${p.type}${p.method ? ' · ' + p.method : ''}${p.note ? ' · ' + p.note : ''}<div class="meta">${fmtDate(p.paid_at)}</div></span>
          <span class="pay-right">
            <span class="${Number(p.amount) < 0 ? 'neg' : ''}">${money(p.amount)}</span>
            <button type="button" class="receipt-btn" data-receipt="${p.id}" title="Print receipt" aria-label="Print receipt for this payment">🖨</button>
          </span>
        </div>`).join('') : '<p class="empty">No payments yet.</p>'}
    </div>
    <div style="text-align:right;margin-top:.7rem">
      <button type="button" class="btn btn-outline btn-sm" id="printInvoiceBtn2">🖨 Print full invoice</button>
    </div>
    <form id="paymentForm" style="margin-top:1.2rem;border-top:1px solid #eee8db;padding-top:1rem">
      <div class="row2">
        <div class="field"><label>Amount (negative = credit/refund)</label><input type="number" step="0.01" name="amount" required></div>
        <div class="field"><label>Type</label>
          <select name="type">
            <option value="deposit">Deposit</option>
            <option value="payment" selected>Payment</option>
            <option value="credit">Credit</option>
            <option value="refund">Refund</option>
          </select>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>Method</label><input name="method" placeholder="cash, zelle, card…"></div>
        <div class="field"><label>Date</label><input type="date" name="paid_at" value="${new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div class="field"><label>Note</label><input name="note"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="modalCancel">Close</button>
        <button type="submit" class="btn btn-teal">Add payment</button>
      </div>
    </form>
  `);

  document.getElementById('printInvoiceBtn2').addEventListener('click', () => printInvoice(client.id));
  document.querySelectorAll('[data-receipt]').forEach(btn =>
    btn.addEventListener('click', () => printReceipt(btn.dataset.receipt)));

  document.getElementById('paymentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const submitBtn = f.querySelector('button[type=submit]');
    submitBtn.disabled = true; // stops a double-click from recording the payment twice
    const payload = {
      client_id: client.id,
      amount: parseFloat(f.amount.value),
      type: f.type.value,
      method: f.method.value.trim() || null,
      note: f.note.value.trim() || null,
      paid_at: f.paid_at.value
    };
    // .select('id') returns the new row's id so the receipt can be printed right away
    const { data: saved, error } = await db.from('payments').insert(payload).select('id').single();
    if (error) { submitBtn.disabled = false; toast('Could not add payment.'); return; }
    toast('Payment added.');
    loadClients();
    loadDashboard();

    // right after taking money is when a receipt is needed — offer it on the spot
    openModal(`
      <h3>Payment recorded</h3>
      <p style="font-size:.95rem">${money(payload.amount)} from ${esc(client.name)} was saved.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="modalCancel">Done</button>
        <button type="button" class="btn btn-outline" id="afterPayInvoice">🖨 Full invoice</button>
        <button type="button" class="btn btn-teal" id="afterPayReceipt">🖨 Print receipt</button>
      </div>
    `);
    document.getElementById('afterPayReceipt').addEventListener('click', () => printReceipt(saved.id));
    document.getElementById('afterPayInvoice').addEventListener('click', () => printInvoice(client.id));
  });
}

/* ---------------- inquiries ---------------- */
async function refreshInqBadge() {
  const { count } = await db.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new');
  const badge = document.getElementById('inqBadge');
  if (count) { badge.style.display = 'inline-block'; badge.textContent = count; }
  else { badge.style.display = 'none'; }
}

async function loadInquiries() {
  const { data, error } = await db.from('inquiries').select('*').order('created_at', { ascending: false });
  if (error) { toast('Could not load inquiries.'); return; }

  const filter = document.getElementById('inqFilter').value;
  let rows = data || [];
  if (filter === 'open') rows = rows.filter(r => r.status === 'new' || r.status === 'contacted');
  else if (filter !== 'all') rows = rows.filter(r => r.status === filter);

  const newCount = (data || []).filter(r => r.status === 'new').length;
  const badge = document.getElementById('inqBadge');
  if (newCount) { badge.style.display = 'inline-block'; badge.textContent = newCount; }
  else { badge.style.display = 'none'; }

  const list = document.getElementById('inqList');
  list.innerHTML = rows.length ? rows.map(r => `
    <div class="card inq-card" data-id="${r.id}">
      <div class="inq-head">
        <div>
          <div class="name">${r.name} ${inqStatusPill(r.status)}</div>
          <div class="inq-meta">${eventTypeLabel(r.event_type)} · ${fmtDate(r.event_date)} · ${r.guest_count || '—'} guests · <a href="tel:${r.phone}">${r.phone}</a></div>
        </div>
      </div>
      ${r.message ? `<div class="inq-msg">${r.message}</div>` : ''}
      <div class="inq-actions">
        <select data-action="status">
          ${['new', 'contacted', 'booked', 'lost'].map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        ${r.converted_client_id ? '<span class="pill paid">Converted</span>' : '<button class="btn btn-outline btn-sm" data-action="convert">Convert to client</button>'}
      </div>
    </div>`).join('') : '<div class="empty">No inquiries here.</div>';

  list.querySelectorAll('.inq-card').forEach(card => {
    const row = rows.find(r => r.id === card.dataset.id);
    card.querySelector('[data-action=status]').addEventListener('change', async e => {
      const { error } = await db.from('inquiries').update({ status: e.target.value }).eq('id', row.id);
      if (error) { toast('Could not update status.'); return; }
      loadInquiries();
    });
    const convertBtn = card.querySelector('[data-action=convert]');
    if (convertBtn) convertBtn.addEventListener('click', () => openClientForm({
      name: row.name, phone: row.phone, email: row.email,
      event_type: row.event_type, event_date: row.event_date,
      notes: row.message ? `From inquiry: ${row.message}` : null,
      _fromInquiry: row.id
    }, false));
  });
}

document.getElementById('inqFilter').addEventListener('change', loadInquiries);

/* ---------------- settings: packages ---------------- */
async function loadPackagesAdmin() {
  const { data, error } = await db.from('packages').select('*').order('sort_order');
  if (error) { toast('Could not load packages.'); return; }

  const list = document.getElementById('pkgList');
  list.innerHTML = (data || []).length ? data.map(p => `
    <div class="card settings-item" data-id="${p.id}">
      <div>
        <strong>${p.name}</strong> ${p.is_popular ? '<span class="pill paid">Popular</span>' : ''} ${!p.active ? '<span class="pill muted">Hidden</span>' : ''}
        <div style="font-size:.8rem;color:var(--grey)">${money(p.base_price)} · ${(p.included_items || []).length} items</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-outline btn-sm" data-action="edit">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty">No packages yet.</div>';

  list.querySelectorAll('.settings-item').forEach(item => {
    const pkg = data.find(p => p.id === item.dataset.id);
    item.querySelector('[data-action=edit]').addEventListener('click', () => openPackageForm(pkg));
    item.querySelector('[data-action=delete]').addEventListener('click', () => deletePackage(pkg));
  });
}

document.getElementById('newPkgBtn').addEventListener('click', () => openPackageForm(null));

function openPackageForm(pkg) {
  const isEdit = !!pkg;
  openModal(`
    <h3>${isEdit ? 'Edit package' : 'New package'}</h3>
    <form id="pkgForm">
      <div class="field"><label>Name</label><input name="name" required value="${pkg?.name || ''}"></div>
      <div class="row2">
        <div class="field"><label>Base price</label><input type="number" step="0.01" name="base_price" required value="${pkg?.base_price ?? ''}"></div>
        <div class="field"><label>Sort order</label><input type="number" name="sort_order" value="${pkg?.sort_order ?? 0}"></div>
      </div>
      <div class="field"><label>Description</label><textarea name="description" rows="2">${pkg?.description || ''}</textarea></div>
      <div class="field"><label>Included items (one per line)</label><textarea name="included_items" rows="4">${(pkg?.included_items || []).join('\n')}</textarea></div>
      <div class="row2">
        <div class="field"><label style="display:flex;align-items:center;gap:.4rem"><input type="checkbox" name="is_popular" ${pkg?.is_popular ? 'checked' : ''} style="width:auto">Mark as popular</label></div>
        <div class="field"><label style="display:flex;align-items:center;gap:.4rem"><input type="checkbox" name="active" ${pkg?.active !== false ? 'checked' : ''} style="width:auto">Visible on site</label></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="modalCancel">Cancel</button>
        <button type="submit" class="btn btn-teal">${isEdit ? 'Save changes' : 'Add package'}</button>
      </div>
    </form>
  `);

  document.getElementById('pkgForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const payload = {
      name: f.name.value.trim(),
      base_price: parseFloat(f.base_price.value),
      sort_order: parseInt(f.sort_order.value, 10) || 0,
      description: f.description.value.trim() || null,
      included_items: f.included_items.value.split('\n').map(s => s.trim()).filter(Boolean),
      is_popular: f.is_popular.checked,
      active: f.active.checked
    };
    const { error } = isEdit
      ? await db.from('packages').update(payload).eq('id', pkg.id)
      : await db.from('packages').insert(payload);
    if (error) { toast('Could not save package.'); return; }
    toast(isEdit ? 'Package updated.' : 'Package added.');
    closeModal();
    loadPackagesAdmin();
  });
}

async function deletePackage(pkg) {
  if (!confirm(`Delete "${pkg.name}"? This can't be undone.`)) return;
  const { error } = await db.from('packages').delete().eq('id', pkg.id);
  if (error) { toast("Could not delete — it's probably linked to a client."); return; }
  toast('Package deleted.');
  loadPackagesAdmin();
}

/* ---------------- settings: gallery ---------------- */
async function loadGalleryAdmin() {
  const { data, error } = await db.from('gallery').select('*').order('sort_order');
  if (error) { toast('Could not load gallery.'); return; }

  const grid = document.getElementById('galleryAdminGrid');
  grid.innerHTML = (data || []).map(g => `
    <div class="g-thumb" data-id="${g.id}">
      <img src="${g.image_url}" alt="${g.alt_text || ''}" loading="lazy">
      <span class="cat">${g.category}</span>
      <button class="del" data-action="delete">Delete</button>
    </div>`).join('');

  grid.querySelectorAll('.g-thumb').forEach(thumb => {
    const item = data.find(g => g.id === thumb.dataset.id);
    thumb.querySelector('.del').addEventListener('click', () => deleteGalleryItem(item));
  });
}

document.getElementById('galleryUploadBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('galleryFile');
  const file = fileInput.files[0];
  if (!file) { toast('Choose a photo first.'); return; }
  const cats = [...document.querySelectorAll('#galleryCats input:checked')].map(c => c.value);
  if (!cats.length) { toast('Check at least one category.'); return; }

  // storage keys choke on spaces/accents — strip them from the filename
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
  const path = `${Date.now()}-${safeName}`;
  const { error: upErr } = await db.storage.from('gallery-images').upload(path, file);
  if (upErr) { toast('Upload failed — ' + upErr.message); return; }

  const { data: pub } = db.storage.from('gallery-images').getPublicUrl(path);
  // one photo can live in several categories — one gallery row per checked box,
  // all pointing at the same uploaded file
  const rows = cats.map(category => ({
    image_url: pub.publicUrl, category, alt_text: `Venecia Reception Hall — ${category}`
  }));
  const { error: insErr } = await db.from('gallery').insert(rows);
  if (insErr) { toast('Uploaded, but could not save it to the gallery list.'); return; }

  toast(cats.length > 1 ? `Photo added to ${cats.length} categories.` : 'Photo uploaded.');
  fileInput.value = '';
  document.querySelectorAll('#galleryCats input:checked').forEach(c => c.checked = false);
  loadGalleryAdmin();
});

async function deleteGalleryItem(item) {
  if (!confirm(`Remove this photo from "${item.category}"? (If it's in other categories too, those copies stay.)`)) return;
  const { error } = await db.from('gallery').delete().eq('id', item.id);
  if (error) { toast('Could not delete photo.'); return; }
  toast('Photo deleted.');
  loadGalleryAdmin();
}

/* ---------------- printing: invoices, receipts, client list ----------------
   How it works: we build a clean document into the hidden #printArea,
   add body.printing (admin.css hides everything else in print), call
   window.print(), and clean up on 'afterprint'. No popup window, so
   pop-up blockers can't stop it, and "Save as PDF" in the print dialog
   gives the client a PDF to text or email. Read-only: nothing is written. */
const BUSINESS = {
  name: 'Venecia Reception Hall',
  address: '243 S Mesa Dr · Mesa, AZ 85210',
  phones: '480-206-8626 · 480-827-1950',
  email: 'info@veneciareceptionhall.com'
};

// client names/notes are typed by people — escape before putting them in HTML
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// stable, human-friendly numbers derived from the row id — no new DB column needed
const invoiceNo = id => 'VEN-' + id.slice(0, 8).toUpperCase();
const receiptNo = id => 'R-' + id.slice(0, 8).toUpperCase();
const todayLong = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
// printed docs show -$300.00 instead of $-300.00
const pm = n => (Number(n) < 0 ? '-' : '') + money(Math.abs(Number(n || 0)));
const PAY_LABELS = { deposit: 'Deposit', payment: 'Payment', credit: 'Credit', refund: 'Refund' };

function printDoc(html, title) {
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  document.body.classList.add('printing');
  // the browser uses document.title as the default PDF filename
  const oldTitle = document.title;
  if (title) document.title = title;
  const done = () => {
    document.body.classList.remove('printing');
    area.innerHTML = '';
    document.title = oldTitle;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // one frame so the browser lays out the new content before the dialog opens
  requestAnimationFrame(() => setTimeout(() => window.print(), 30));
}

function docHeader(kind, number, extraRight = '') {
  return `
    <header class="pd-head">
      <div>
        <div class="pd-logo">Venecia</div>
        <div class="pd-biz">${BUSINESS.name}<br>${BUSINESS.address}<br>${BUSINESS.phones}<br>${BUSINESS.email}</div>
      </div>
      <div class="pd-meta">
        <div class="pd-kind">${kind}</div>
        ${number ? `<div><span>No.</span> ${number}</div>` : ''}
        <div><span>Date</span> ${todayLong()}</div>
        ${extraRight}
      </div>
    </header>`;
}

// everything an invoice needs, fetched in parallel
async function fetchClientBundle(clientId) {
  const [cRes, pRes, bRes] = await Promise.all([
    db.from('clients').select('*').eq('id', clientId).single(),
    db.from('payments').select('*').eq('client_id', clientId)
      .order('paid_at', { ascending: true }).order('created_at', { ascending: true }),
    db.from('client_balances').select('total_paid,balance_owed').eq('id', clientId).single()
  ]);
  if (cRes.error || !cRes.data) return null;
  let pkg = null;
  if (cRes.data.package_id) {
    const { data } = await db.from('packages').select('name,description,included_items').eq('id', cRes.data.package_id).single();
    pkg = data;
  }
  return { client: cRes.data, payments: pRes.data || [], bal: bRes.data || { total_paid: 0, balance_owed: cRes.data.contract_price }, pkg };
}

function billToBlock(c, pkg) {
  return `
    <section class="pd-parties">
      <div>
        <h4>Bill to</h4>
        <p><strong>${esc(c.name)}</strong><br>${esc(c.phone)}${c.email ? '<br>' + esc(c.email) : ''}</p>
      </div>
      <div>
        <h4>Event</h4>
        <p><strong>${eventTypeLabel(c.event_type)}</strong><br>${fmtDate(c.event_date)}${pkg ? '<br>' + esc(pkg.name) : ''}</p>
      </div>
    </section>`;
}

async function printInvoice(clientId) {
  toast('Preparing invoice…');
  const b = await fetchClientBundle(clientId);
  if (!b) { toast('Could not load this client to print.'); return; }
  const { client: c, payments, bal, pkg } = b;
  const owed = Number(bal.balance_owed);
  const credits = payments.filter(p => p.type === 'credit').reduce((s, p) => s + Number(p.amount), 0);
  const received = payments.filter(p => p.type !== 'credit').reduce((s, p) => s + Number(p.amount), 0);

  const html = `
    <div class="pd">
      ${docHeader('Invoice', invoiceNo(c.id), `<div><span>Status</span> ${owed <= 0 ? 'Paid in full' : 'Balance due'}</div>`)}
      ${billToBlock(c, pkg)}

      <table class="pd-table">
        <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>
              <strong>${pkg ? esc(pkg.name) : eventTypeLabel(c.event_type) + ' event package'}</strong>
              <div class="pd-sub">${eventTypeLabel(c.event_type)} · ${fmtDate(c.event_date)}</div>
              ${pkg && (pkg.included_items || []).length
                ? `<ul class="pd-items">${pkg.included_items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
            </td>
            <td class="num">${pm(c.contract_price)}</td>
          </tr>
        </tbody>
      </table>

      <h4 class="pd-section">Payment history</h4>
      ${payments.length ? `
      <table class="pd-table pd-compact">
        <thead><tr><th>Date</th><th>Type</th><th>Method</th><th>Note</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${payments.map(p => `
            <tr>
              <td>${fmtDate(p.paid_at)}</td>
              <td>${PAY_LABELS[p.type] || esc(p.type)}</td>
              <td>${esc(p.method || '—')}</td>
              <td>${esc(p.note || '')}</td>
              <td class="num">${pm(p.amount)}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p class="pd-muted">No payments recorded yet.</p>'}

      <table class="pd-totals">
        <tr><td>Contract total</td><td class="num">${pm(c.contract_price)}</td></tr>
        ${credits ? `<tr><td>Credits / adjustments</td><td class="num">${pm(credits)}</td></tr>` : ''}
        <tr><td>Payments received</td><td class="num">${pm(received)}</td></tr>
        <tr class="pd-due"><td>${owed <= 0 ? 'Balance' : 'Balance due'}</td><td class="num">${pm(Math.max(0, owed))}</td></tr>
      </table>
      ${owed <= 0 ? '<div class="pd-stamp">Paid in full</div>' : ''}

      <footer class="pd-foot">
        <p class="pd-script">Gracias</p>
        <p>Thank you for celebrating with Venecia. Questions about this invoice? Call ${BUSINESS.phones.split(' · ')[0]}.</p>
      </footer>
    </div>`;

  printDoc(html, `Venecia Invoice ${invoiceNo(c.id)} - ${c.name}`);
}

async function printReceipt(paymentId) {
  toast('Preparing receipt…');
  const { data: pay, error } = await db.from('payments').select('*').eq('id', paymentId).single();
  if (error || !pay) { toast('Could not load this payment.'); return; }
  const b = await fetchClientBundle(pay.client_id);
  if (!b) { toast('Could not load the client for this receipt.'); return; }
  const { client: c, payments, pkg } = b;

  // balance as of THIS payment (not today's), so reprinting an old receipt stays accurate
  const idx = payments.findIndex(p => p.id === pay.id);
  const paidThrough = payments.slice(0, idx + 1).reduce((s, p) => s + Number(p.amount), 0);
  const balanceAfter = Number(c.contract_price) - paidThrough;
  const isRefund = Number(pay.amount) < 0;

  const html = `
    <div class="pd pd-receipt">
      ${docHeader(isRefund ? 'Refund receipt' : 'Payment receipt', receiptNo(pay.id), `<div><span>Invoice</span> ${invoiceNo(c.id)}</div>`)}
      ${billToBlock(c, pkg)}

      <div class="pd-amount">
        <div class="pd-amount-label">${isRefund ? 'Amount refunded' : 'Amount received'}</div>
        <div class="pd-amount-value">${pm(Math.abs(Number(pay.amount)))}</div>
      </div>

      <table class="pd-totals pd-totals-wide">
        <tr><td>Payment date</td><td class="num">${fmtDate(pay.paid_at)}</td></tr>
        <tr><td>Type</td><td class="num">${PAY_LABELS[pay.type] || esc(pay.type)}</td></tr>
        <tr><td>Method</td><td class="num">${esc(pay.method || '—')}</td></tr>
        ${pay.note ? `<tr><td>Note</td><td class="num">${esc(pay.note)}</td></tr>` : ''}
        <tr><td>Contract total</td><td class="num">${pm(c.contract_price)}</td></tr>
        <tr><td>Paid to date (incl. this)</td><td class="num">${pm(paidThrough)}</td></tr>
        <tr class="pd-due"><td>Remaining balance</td><td class="num">${pm(Math.max(0, balanceAfter))}</td></tr>
      </table>
      ${balanceAfter <= 0 ? '<div class="pd-stamp">Paid in full</div>' : ''}

      <div class="pd-sign">
        <div><span></span>Received by</div>
        <div><span></span>Client signature</div>
      </div>

      <footer class="pd-foot">
        <p class="pd-script">Gracias</p>
        <p>Please keep this receipt for your records.</p>
      </footer>
    </div>`;

  printDoc(html, `Venecia Receipt ${receiptNo(pay.id)} - ${c.name}`);
}

// prints exactly what the Clients tab is showing (same search + status filter)
function printClientList() {
  const search = document.getElementById('clientSearch').value.trim().toLowerCase();
  const statusFilter = document.getElementById('clientStatusFilter').value;
  let rows = allClients;
  if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
  if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search) || (r.phone || '').includes(search));
  if (!rows.length) { toast('Nothing to print — the list is empty.'); return; }

  const sum = key => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const filterLabel = document.getElementById('clientStatusFilter').selectedOptions[0].textContent;

  const html = `
    <div class="pd pd-list">
      ${docHeader('Client list', '', `<div><span>Showing</span> ${esc(filterLabel)}${search ? ' · “' + esc(search) + '”' : ''}</div>`)}
      <table class="pd-table pd-compact">
        <thead><tr><th>Client</th><th>Phone</th><th>Event</th><th>Date</th><th class="num">Contract</th><th class="num">Paid</th><th class="num">Owes</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${eventTypeLabel(r.event_type)}</td>
              <td>${fmtDate(r.event_date)}</td><td class="num">${pm(r.contract_price)}</td>
              <td class="num">${pm(r.total_paid)}</td><td class="num">${pm(r.balance_owed)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="4">${rows.length} client${rows.length === 1 ? '' : 's'}</td>
            <td class="num">${pm(sum('contract_price'))}</td><td class="num">${pm(sum('total_paid'))}</td><td class="num">${pm(sum('balance_owed'))}</td></tr>
        </tfoot>
      </table>
    </div>`;

  printDoc(html, 'Venecia Client List');
}
document.getElementById('printClientsBtn').addEventListener('click', printClientList);

/* ---------------- settings: videos ----------------
   Videos live on YouTube, not in Supabase Storage. Why:
   - Supabase free tier has 1 GB storage and caps bandwidth; a few event
     videos watched a few hundred times would blow through it.
   - YouTube re-encodes for every screen + connection speed for free.
   We only store the 11-character video ID. The site shows a lightweight
   thumbnail and only loads YouTube's player when someone taps play. */
function parseYouTubeId(input) {
  const s = (input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return { id: s, vertical: false };
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1, 12);
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      id = u.searchParams.get('v');
      if (!id) {
        const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{11})/);
        if (m) id = m[2];
      }
    }
    if (id && /^[\w-]{11}$/.test(id)) return { id, vertical: /\/shorts\//.test(u.pathname) };
  } catch (e) { /* not a URL */ }
  return null;
}

const VIDEO_CAT_LABELS = { weddings: 'Weddings', quinceaneras: 'Quinceañeras', sweet16: 'Sweet 16', venue: 'The venue', other: 'Other' };

async function loadVideosAdmin() {
  const grid = document.getElementById('videoAdminGrid');
  const { data, error } = await db.from('videos').select('*').order('sort_order').order('created_at', { ascending: false });
  if (error) {
    // table not created yet — explain instead of failing silently
    grid.innerHTML = '<p class="empty" style="grid-column:1/-1">Videos aren\'t set up in the database yet (run videos_setup.sql once).</p>';
    return;
  }
  grid.innerHTML = (data || []).length ? data.map(v => `
    <div class="g-thumb" data-id="${v.id}">
      <img src="https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg" alt="${esc(v.title || 'Video')}" loading="lazy">
      <span class="cat">${VIDEO_CAT_LABELS[v.category] || v.category}${v.is_vertical ? ' · Short' : ''}</span>
      <button class="del" data-action="delete">Delete</button>
      ${v.title ? `<span class="v-admin-title">${esc(v.title)}</span>` : ''}
    </div>`).join('') : '<p class="empty" style="grid-column:1/-1">No videos yet.</p>';

  grid.querySelectorAll('.g-thumb').forEach(thumb => {
    const v = data.find(x => x.id === thumb.dataset.id);
    thumb.querySelector('.del').addEventListener('click', async () => {
      if (!confirm('Remove this video from the website? (It stays on YouTube.)')) return;
      const { error: delErr } = await db.from('videos').delete().eq('id', v.id);
      if (delErr) { toast('Could not delete video.'); return; }
      toast('Video removed.');
      loadVideosAdmin();
    });
  });
}

document.getElementById('videoForm').addEventListener('submit', async e => {
  e.preventDefault();
  const parsed = parseYouTubeId(document.getElementById('videoUrl').value);
  if (!parsed) { toast("That doesn't look like a YouTube link."); return; }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  const { error } = await db.from('videos').insert({
    youtube_id: parsed.id,
    is_vertical: parsed.vertical,
    title: document.getElementById('videoTitle').value.trim() || null,
    category: document.getElementById('videoCategory').value
  });
  btn.disabled = false;
  if (error) { toast('Could not add video — ' + error.message); return; }
  toast('Video added to the website.');
  e.target.reset();
  loadVideosAdmin();
});
