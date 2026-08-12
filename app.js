// ==========================================================================
// STITCHCRAFT BOUTIQUE - APP LOGIC (Floating Widgets + Emerald Theme)
// ==========================================================================
const state = {
  currentUser: { role: null, token: null, mobile: null, name: null },
  orders: [],
  customerOrders: [],
  selectedChatMobile: null,
  apiBase: window.location.origin
};
let garmentCounter = 0;
// ---- Toast ----
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  toastMsg.textContent = message;
  toast.className = 'toast-notification glass';
  toast.style.borderLeftColor = type === 'error' ? 'var(--color-red)' : type === 'warning' ? 'var(--color-orange)' : 'var(--color-primary)';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}
// ---- Simulated SMS Banner ----
function triggerSmsSimulation(mobile, message) {
  const container = document.getElementById('sms-banner-container');
  const sms = document.createElement('div');
  sms.className = 'sms-banner glass';
  sms.innerHTML = `
    <div class="sms-banner-icon"><i data-lucide="smartphone"></i></div>
    <div class="sms-banner-content">
      <h4>SMS Notification Sent</h4>
      <p><strong>To ${mobile}:</strong> "${message}"</p>
    </div>`;
  container.appendChild(sms);
  lucide.createIcons();
  setTimeout(() => { sms.style.opacity = '0'; sms.style.transition = 'opacity 0.4s'; setTimeout(() => sms.remove(), 400); }, 7000);
}
// ---- Floating Widget Toggles ----
function toggleTranslatorWidget() {
  const panel = document.getElementById('translator-widget');
  const chatPanel = document.getElementById('chatbot-widget');
  chatPanel.classList.add('hidden');
  panel.classList.toggle('hidden');
  lucide.createIcons();
}
function toggleChatbotWidget() {
  const panel = document.getElementById('chatbot-widget');
  const transPanel = document.getElementById('translator-widget');
  transPanel.classList.add('hidden');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) loadWidgetChats();
  lucide.createIcons();
}
// ---- Auth & Routing ----
function switchLoginTab(role) {
  const tabC = document.getElementById('tab-customer'), tabA = document.getElementById('tab-admin');
  const formC = document.getElementById('customer-login-form'), formA = document.getElementById('admin-login-form');
  if (role === 'admin') { tabA.classList.add('active'); tabC.classList.remove('active'); formA.classList.remove('hidden'); formC.classList.add('hidden'); }
  else { tabC.classList.add('active'); tabA.classList.remove('active'); formC.classList.remove('hidden'); formA.classList.add('hidden'); }
}
async function handleLogin(event, role) {
  event.preventDefault();
  const payload = { role };
  if (role === 'admin') payload.password = document.getElementById('admin-password').value;
  else payload.mobile = document.getElementById('customer-mobile').value;
  try {
    const res = await fetch(`${state.apiBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.success) {
      state.currentUser = { role: data.role, token: data.token || null, mobile: data.mobile || null, name: data.customerName || 'Boutique Client' };
      showToast(`Welcome, ${state.currentUser.name}!`);
      document.getElementById('login-section').classList.add('hidden');
      document.getElementById('dashboard-section').classList.remove('hidden');
      document.getElementById('floating-actions-container').style.display = 'flex';
      document.getElementById('user-display-name').textContent = state.currentUser.name;
      const badge = document.getElementById('role-badge');
      if (role === 'admin') {
        badge.textContent = 'Admin'; badge.style.backgroundColor = 'var(--color-primary)';
        document.getElementById('admin-nav-links').classList.remove('hidden');
        document.getElementById('customer-nav-links').classList.add('hidden');
        switchView('admin-overview');
        document.getElementById('garment-items-list').innerHTML = ''; garmentCounter = 0; addGarmentFormBlock();
        await refreshAdminDashboard();
        const dd = new Date(); dd.setDate(dd.getDate() + 7);
        document.getElementById('order-delivery-date').value = dd.toISOString().split('T')[0];
      } else {
        badge.textContent = 'Customer'; badge.style.backgroundColor = 'var(--color-accent)';
        document.getElementById('admin-nav-links').classList.add('hidden');
        document.getElementById('customer-nav-links').classList.remove('hidden');
        switchView('customer-status'); await refreshCustomerDashboard();
      }
      lucide.createIcons();
    } else { showToast(data.message || 'Login failed.', 'error'); }
  } catch (err) { console.error(err); showToast('Connection failed.', 'error'); }
}
function handleLogout() {
  state.currentUser = { role: null, token: null, mobile: null, name: null };
  document.getElementById('admin-password').value = '';
  document.getElementById('customer-mobile').value = '';
  document.getElementById('dashboard-section').classList.add('hidden');
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('floating-actions-container').style.display = 'none';
  document.getElementById('translator-widget').classList.add('hidden');
  document.getElementById('chatbot-widget').classList.add('hidden');
  showToast('Logged out.');
}
function switchView(viewName) {
  document.querySelectorAll('.dashboard-view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(l => { l.classList.remove('active'); if (l.getAttribute('onclick').includes(viewName)) l.classList.add('active'); });
  if (viewName === 'admin-overview') refreshAdminDashboard();
  else if (viewName === 'admin-orders') loadOrdersTable();
  else if (viewName === 'admin-chatbot') loadAdminChatThreads();
  else if (viewName === 'customer-status') refreshCustomerDashboard();
  lucide.createIcons();
}
// ---- Multi-Item Order Form ----
const measurementTemplates = {
  'Three-Piece Suit': ['Neck', 'Chest', 'Waist', 'Hip', 'Shoulder', 'Sleeve Length', 'Jacket Length', 'Trouser Length', 'Inseam'],
  'Shirt': ['Neck', 'Chest', 'Waist', 'Shoulder', 'Sleeve Length', 'Shirt Length'],
  'Trousers': ['Waist', 'Hip', 'Trouser Length', 'Inseam'],
  'Evening Gown': ['Bust', 'Waist', 'Hip', 'Shoulder to Waist', 'Gown Length'],
  'Custom Item': ['Neck', 'Waist', 'Length']
};
function addGarmentFormBlock() {
  const list = document.getElementById('garment-items-list');
  const idx = garmentCounter++;
  const card = document.createElement('div');
  card.className = 'garment-card'; card.id = `garment-block-${idx}`;
  card.innerHTML = `
    <div class="garment-card-header"><h4><i data-lucide="scissors" style="width:16px;"></i> Garment #${idx + 1}</h4><button type="button" class="btn-remove-garment" onclick="removeGarmentFormBlock(${idx})"><i data-lucide="trash-2" style="width:14px;"></i> Remove</button></div>
    <div class="form-row"><div class="form-group flex-1"><label>Type</label><select class="garment-type-select" data-index="${idx}" onchange="adjustGarmentBlockMeasurements(${idx})"><option value="Three-Piece Suit">Three-Piece Suit</option><option value="Shirt">Shirt</option><option value="Trousers">Trousers</option><option value="Evening Gown">Evening Gown</option><option value="Custom Item">Custom Item</option></select></div><div class="form-group flex-1"><label>Price ($)</label><input type="number" class="garment-price-input" placeholder="100" min="0" value="100" oninput="calculateTotalFormPrices()" required></div></div>
    <div class="form-group"><label>Measurements</label><div class="measurements-grid" id="measurements-wrapper-${idx}"></div></div>
    <div class="form-group"><label>Design Notes</label><textarea class="garment-notes-input" placeholder="Fabric, buttons, style..." rows="2"></textarea></div>`;
  list.appendChild(card);
  adjustGarmentBlockMeasurements(idx);
  lucide.createIcons();
  calculateTotalFormPrices();
}
function removeGarmentFormBlock(idx) {
  const b = document.getElementById(`garment-block-${idx}`);
  if (b) { b.remove(); calculateTotalFormPrices(); reorderGarmentHeaders(); }
}
function reorderGarmentHeaders() {
  document.querySelectorAll('.garment-card').forEach((c, i) => {
    const h4 = c.querySelector('.garment-card-header h4');
    if (h4) h4.innerHTML = `<i data-lucide="scissors" style="width:16px;"></i> Garment #${i + 1}`;
  });
  lucide.createIcons();
}
function adjustGarmentBlockMeasurements(idx) {
  const block = document.getElementById(`garment-block-${idx}`);
  if (!block) return;
  const sel = block.querySelector('.garment-type-select');
  const wr = document.getElementById(`measurements-wrapper-${idx}`);
  wr.innerHTML = '';
  (measurementTemplates[sel.value] || ['Neck', 'Waist', 'Length']).forEach(f => {
    const fg = document.createElement('div'); fg.className = 'form-group';
    fg.innerHTML = `<label style="font-size:0.74rem; color:var(--text-muted);">${f}</label><input type="text" placeholder="e.g. 15 in" class="block-measurement-field" data-field-name="${f}" style="padding:8px; font-size:0.84rem;">`;
    wr.appendChild(fg);
  });
}
function calculateTotalFormPrices() {
  let t = 0; document.querySelectorAll('.garment-price-input').forEach(i => t += Number(i.value) || 0);
  document.getElementById('calculated-total-price-display').textContent = t;
  return t;
}
// ---- Admin Dashboard Stats ----
async function refreshAdminDashboard() {
  try {
    const res = await fetch(`${state.apiBase}/api/orders`);
    const orders = await res.json(); state.orders = orders;
    document.getElementById('stat-total-orders').textContent = orders.length;
    document.getElementById('stat-pending-orders').textContent = orders.filter(o => o.status === 'Pending' || o.status === 'In Progress').length;
    document.getElementById('stat-completed-orders').textContent = orders.filter(o => o.status === 'Completed' || o.status === 'Delivered').length;
    document.getElementById('stat-revenue').textContent = `$${orders.reduce((s, o) => s + o.totalPrice, 0)}`;
    renderPriorityDeadlines(orders);
  } catch (err) { console.error(err); showToast('Failed to refresh.', 'error'); }
}
function renderPriorityDeadlines(orders) {
  const el = document.getElementById('priority-orders-list'); el.innerHTML = '';
  const active = orders.filter(o => o.status !== 'Delivered' && o.status !== 'Completed').sort((a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate));
  if (!active.length) { el.innerHTML = '<p class="loading-placeholder">No active deadlines.</p>'; return; }
  active.forEach(o => {
    const days = Math.ceil((new Date(o.deliveryDate) - new Date()) / 86400000);
    let cls = 'ok', txt = `In ${days} days`;
    if (days < 0) { cls = 'danger'; txt = `OVERDUE (${Math.abs(days)}d)`; } else if (days <= 3) { cls = 'warning'; txt = `Due in ${days}d!`; }
    const c = document.createElement('div'); c.className = 'priority-order-card';
    c.innerHTML = `<div class="p-order-info"><h4>${o.customerName}</h4><p>${o.items.map(i => i.itemType).join(', ')} • ${o.id}</p></div><div class="p-order-deadline"><span class="deadline-tag ${cls}">${txt}</span><p style="font-size:.8rem;color:var(--text-muted)">${o.deliveryDate}</p></div>`;
    el.appendChild(c);
  });
}
// ---- Create Order ----
async function handleCreateOrder(event) {
  event.preventDefault();
  const cards = document.querySelectorAll('.garment-card');
  if (!cards.length) { showToast('Add at least one garment.', 'warning'); return; }
  const items = [];
  cards.forEach(c => {
    const measurements = {};
    c.querySelectorAll('.block-measurement-field').forEach(f => { const v = f.value.trim(); if (v) measurements[f.getAttribute('data-field-name')] = v; });
    items.push({ itemType: c.querySelector('.garment-type-select').value, price: c.querySelector('.garment-price-input').value, notes: c.querySelector('.garment-notes-input').value, measurements });
  });
  const payload = { customerName: document.getElementById('order-client-name').value, mobile: document.getElementById('order-client-mobile').value, items, deliveryDate: document.getElementById('order-delivery-date').value, amountPaid: document.getElementById('order-deposit').value, totalPrice: calculateTotalFormPrices() };
  try {
    const res = await fetch(`${state.apiBase}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { showToast('Order created!'); document.getElementById('quick-order-form').reset(); document.getElementById('garment-items-list').innerHTML = ''; garmentCounter = 0; addGarmentFormBlock(); await refreshAdminDashboard(); }
    else { const e = await res.json(); showToast(e.error || 'Failed.', 'error'); }
  } catch (err) { console.error(err); showToast('Server error.', 'error'); }
}
// ---- Orders Table ----
async function loadOrdersTable() {
  try { const res = await fetch(`${state.apiBase}/api/orders`); state.orders = await res.json(); renderOrdersTable(state.orders); } catch (err) { console.error(err); }
}
function renderOrdersTable(orders) {
  const tb = document.getElementById('orders-table-body'); tb.innerHTML = '';
  if (!orders.length) { tb.innerHTML = `<tr><td colspan="8" class="loading-placeholder">No orders found.</td></tr>`; return; }
  orders.forEach(o => {
    const bal = o.totalPrice - o.amountPaid;
    let sc = 'status-pending'; if (o.status === 'In Progress') sc = 'status-inprogress'; if (o.status === 'Completed') sc = 'status-completed'; if (o.status === 'Delivered') sc = 'status-delivered';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${o.id}</strong></td><td>${o.customerName}</td><td>${o.mobile}</td><td style="font-size:.85rem;color:var(--text-muted)">${o.items.map(i=>i.itemType).join(', ')}</td><td>${o.deliveryDate}</td><td><span class="table-status-tag ${bal <= 0 ? 'status-delivered' : 'status-pending'}">${bal <= 0 ? 'Paid' : `Due: $${bal}`}</span></td><td><span class="table-status-tag ${sc}">${o.status}</span></td><td><div class="action-row"><button class="btn-icon-sm" onclick="openOrderDetails('${o.id}')" title="View"><i data-lucide="eye"></i></button><button class="btn-icon-sm" onclick="quickIncrementStatus('${o.id}','${o.status}')" title="Advance"><i data-lucide="arrow-right-circle"></i></button></div></td>`;
    tb.appendChild(tr);
  });
  lucide.createIcons();
}
function filterOrdersTable() {
  const q = document.getElementById('order-search-input').value.toLowerCase().trim();
  const sf = document.getElementById('status-filter').value;
  renderOrdersTable(state.orders.filter(o => (o.customerName.toLowerCase().includes(q) || o.mobile.includes(q)) && (sf === 'All' || o.status === sf)));
}
function openOrderDetails(orderId) {
  const o = state.orders.find(x => x.id === orderId); if (!o) return;
  document.getElementById('modal-order-title').textContent = `${o.customerName} (${o.id})`;
  let itemsHtml = '';
  o.items.forEach((it, i) => {
    let mH = ''; const ks = Object.keys(it.measurements);
    if (ks.length) { mH = '<div class="measurement-badge-list">'; ks.forEach(k => mH += `<div class="measurement-badge-item"><span>${k}:</span><strong>${it.measurements[k]}</strong></div>`); mH += '</div>'; }
    else mH = '<p style="color:var(--text-muted);font-size:.8rem">No measurements.</p>';
    itemsHtml += `<div class="modal-item-card"><div class="modal-item-title"><span>${i+1}. ${it.itemType}</span><strong style="color:var(--color-primary)">$${it.price}</strong></div><p style="font-size:.82rem;margin-bottom:8px"><strong>Notes:</strong> ${it.notes || 'N/A'}</p>${mH}</div>`;
  });
  const bal = o.totalPrice - o.amountPaid;
  document.getElementById('modal-order-body').innerHTML = `
    <div class="modal-detail-row"><span class="modal-detail-label">Mobile:</span><span class="modal-detail-value">${o.mobile}</span></div>
    <div class="modal-detail-row"><span class="modal-detail-label">Delivery:</span><span class="modal-detail-value">${o.deliveryDate}</span></div>
    <hr style="border:0;border-top:1px solid var(--border-color);margin:14px 0">
    <div class="modal-detail-row"><span class="modal-detail-label">Total:</span><span class="modal-detail-value">$${o.totalPrice}</span></div>
    <div class="modal-detail-row"><span class="modal-detail-label">Paid:</span><span class="modal-detail-value">$${o.amountPaid}</span></div>
    <div class="modal-detail-row"><span class="modal-detail-label">Balance:</span><span class="modal-detail-value" style="color:${bal > 0 ? 'var(--color-orange)' : 'var(--color-primary)'}">$${bal}</span></div>
    <hr style="border:0;border-top:1px solid var(--border-color);margin:14px 0">
    <h4 style="font-size:.95rem;margin-bottom:12px">Garments:</h4>${itemsHtml}
    <hr style="border:0;border-top:1px solid var(--border-color);margin:14px 0">
    <div class="form-group" style="margin-top:14px"><label>Update Status</label>
    <select id="modal-status-select" onchange="handleModalStatusUpdate('${o.id}',this.value)">
      <option value="Pending" ${o.status==='Pending'?'selected':''}>Pending</option>
      <option value="In Progress" ${o.status==='In Progress'?'selected':''}>In Progress</option>
      <option value="Completed" ${o.status==='Completed'?'selected':''}>Completed</option>
      <option value="Delivered" ${o.status==='Delivered'?'selected':''}>Delivered</option>
    </select></div>`;
  document.getElementById('order-modal').classList.remove('hidden');
}
function closeOrderModal() { document.getElementById('order-modal').classList.add('hidden'); }
async function handleModalStatusUpdate(id, status) {
  try {
    const res = await fetch(`${state.apiBase}/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const data = await res.json();
    if (res.ok) { showToast(`${id} → ${status}`); if (data.smsNotification) triggerSmsSimulation(data.smsNotification.recipientMobile, data.smsNotification.message); await loadOrdersTable(); closeOrderModal(); }
    else showToast('Update failed.', 'error');
  } catch (err) { console.error(err); showToast('Update failed.', 'error'); }
}
async function quickIncrementStatus(id, cur) {
  let next = cur === 'Pending' ? 'In Progress' : cur === 'In Progress' ? 'Completed' : cur === 'Completed' ? 'Delivered' : null;
  if (!next) return;
  try {
    const res = await fetch(`${state.apiBase}/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    const data = await res.json();
    if (res.ok) { showToast(`${id} → ${next}`); if (data.smsNotification) triggerSmsSimulation(data.smsNotification.recipientMobile, data.smsNotification.message); await loadOrdersTable(); await refreshAdminDashboard(); }
  } catch (err) { console.error(err); }
}
window.onclick = function(e) { if (e.target === document.getElementById('order-modal')) closeOrderModal(); }
// ---- Admin Chat Logs ----
async function loadAdminChatThreads() {
  try {
    const res = await fetch(`${state.apiBase}/api/orders`); const orders = await res.json(); state.orders = orders;
    const el = document.getElementById('admin-chat-threads'); el.innerHTML = '';
    const seen = new Set(), clients = [];
    orders.forEach(o => { if (!seen.has(o.mobile)) { seen.add(o.mobile); clients.push({ mobile: o.mobile, name: o.customerName, items: o.items.map(i => i.itemType).join(', ') }); } });
    if (!clients.length) { el.innerHTML = '<p class="loading-placeholder">No clients.</p>'; return; }
    clients.forEach(c => {
      const d = document.createElement('div'); d.className = `chat-thread-item ${state.selectedChatMobile === c.mobile ? 'active' : ''}`;
      d.onclick = () => selectAdminChatThread(c.mobile, c.name);
      d.innerHTML = `<h4>${c.name}</h4><p>${c.mobile} • ${c.items}</p>`;
      el.appendChild(d);
    });
  } catch (err) { console.error(err); }
}
async function selectAdminChatThread(mobile, name) {
  state.selectedChatMobile = mobile;
  loadAdminChatThreads();
  document.getElementById('admin-chat-header').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><h3>Thread: ${name}</h3><p style="font-size:.8rem;color:var(--text-muted)">Mobile: ${mobile}</p></div><button class="btn btn-secondary" onclick="sendAdminHi('${mobile}')" style="padding:6px 12px;font-size:.8rem">Send "Hi"</button></div>`;
  document.getElementById('admin-chat-form').classList.remove('hidden');
  await refreshAdminChatMessages(mobile);
}
async function refreshAdminChatMessages(mobile) {
  try {
    const res = await fetch(`${state.apiBase}/api/chat/${mobile}`); const chats = await res.json();
    const el = document.getElementById('admin-chat-messages'); el.innerHTML = '';
    if (!chats.length) { el.innerHTML = '<div class="chat-welcome-state"><i data-lucide="message-square" class="welcome-icon"></i><p>No messages yet.</p></div>'; lucide.createIcons(); return; }
    chats.forEach(c => {
      const b = document.createElement('div'); b.className = `chat-bubble ${c.sender === 'customer' ? 'customer-sender' : 'admin-sender'}${c.sender === 'bot' ? ' bot-sender' : ''}`;
      b.innerHTML = `<strong style="display:block;font-size:.7rem;margin-bottom:2px;opacity:.8">${c.sender === 'customer' ? 'Client' : c.sender.toUpperCase()}</strong><div>${c.message}</div><span class="chat-bubble-time">${new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
      el.appendChild(b);
    });
    el.scrollTop = el.scrollHeight;
  } catch (err) { console.error(err); }
}
async function handleSendAdminChat(event) {
  event.preventDefault();
  const inp = document.getElementById('admin-chat-input'); const msg = inp.value.trim();
  if (!msg || !state.selectedChatMobile) return;
  try { const res = await fetch(`${state.apiBase}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: state.selectedChatMobile, sender: 'admin', message: msg }) }); if (res.ok) { inp.value = ''; await refreshAdminChatMessages(state.selectedChatMobile); } } catch (err) { console.error(err); }
}
async function sendAdminHi(mobile) {
  try { const res = await fetch(`${state.apiBase}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile, sender: 'admin', message: 'Hi' }) }); if (res.ok) { showToast('Hi sent!'); await refreshAdminChatMessages(mobile); } } catch (err) { console.error(err); }
}
// ---- Customer Order Tracker ----
async function refreshCustomerDashboard() {
  const el = document.getElementById('customer-orders-container'); el.innerHTML = '<p class="loading-placeholder">Loading...</p>';
  try {
    const res = await fetch(`${state.apiBase}/api/customer/orders?mobile=${state.currentUser.mobile}`);
    const orders = await res.json(); state.customerOrders = orders;
    document.getElementById('customer-name-display').textContent = state.currentUser.name;
    if (!orders.length) { el.innerHTML = '<div class="panel glass" style="text-align:center;padding:40px"><h3>No Orders Found</h3><p style="color:var(--text-muted);margin-top:8px">Contact admin to register your number.</p></div>'; return; }
    el.innerHTML = '';
    orders.forEach(o => {
      const bal = o.totalPrice - o.amountPaid; const payText = bal <= 0 ? 'Full payment received' : `Balance: $${bal} ($${o.amountPaid} of $${o.totalPrice})`;
      const sMap = { 'Pending': 1, 'In Progress': 2, 'Completed': 3, 'Delivered': 4 }; const step = sMap[o.status] || 1; const barW = ((step - 1) / 3) * 90;
      let itemsHtml = '';
      o.items.forEach((it, i) => {
        let mH = ''; Object.keys(it.measurements).forEach(k => mH += `<div class="measurement-badge-item"><span>${k}:</span><strong>${it.measurements[k]}</strong></div>`);
        itemsHtml += `<div class="detail-block" style="margin-bottom:12px"><h4><i data-lucide="scissors" style="width:14px;vertical-align:middle;margin-right:4px"></i> #${i+1}: ${it.itemType}</h4><p style="font-size:.85rem;margin-bottom:6px"><strong>Notes:</strong> ${it.notes||'Bespoke design.'}</p>${mH ? `<div class="measurement-badge-list">${mH}</div>` : '<p style="font-size:.8rem;color:var(--text-muted)">Measurements pending.</p>'}</div>`;
      });
      const card = document.createElement('div'); card.className = 'cust-order-card panel glass';
      card.innerHTML = `
        <div class="cust-order-header"><div><h2>Order #${o.id}</h2><p style="font-size:.8rem;color:var(--text-muted)">Placed: ${new Date(o.createdAt).toLocaleDateString()}</p></div><span class="table-status-tag status-${o.status.toLowerCase().replace(/\s+/g,'')}">${o.status}</span></div>
        <div class="timeline-container"><div class="timeline-progress-bar" style="width:${barW}%"></div>
          <div class="timeline-step ${step>=1?(step===1?'active':'completed'):''}"><div class="step-dot"><i data-lucide="scissors"></i></div><div class="step-label">Pending</div></div>
          <div class="timeline-step ${step>=2?(step===2?'active':'completed'):''}"><div class="step-dot"><i data-lucide="hammer"></i></div><div class="step-label">In Progress</div></div>
          <div class="timeline-step ${step>=3?(step===3?'active':'completed'):''}"><div class="step-dot"><i data-lucide="check"></i></div><div class="step-label">Completed</div></div>
          <div class="timeline-step ${step>=4?(step===4?'active':'completed'):''}"><div class="step-dot"><i data-lucide="truck"></i></div><div class="step-label">Delivered</div></div>
        </div>
        <div class="cust-detail-grid"><div class="detail-block"><h4><i data-lucide="info" style="width:14px;vertical-align:middle;margin-right:4px"></i> Accounts</h4><p style="margin-bottom:8px"><strong>Delivery:</strong> ${o.deliveryDate}</p><p style="margin-bottom:8px"><strong>Total:</strong> $${o.totalPrice}</p><p>${payText}</p></div><div>${itemsHtml}</div></div>`;
      el.appendChild(card);
    });
    lucide.createIcons();
  } catch (err) { console.error(err); el.innerHTML = '<p class="loading-placeholder">Connection error.</p>'; }
}
// ---- Floating Chatbot Widget (Customer & Admin) ----
async function loadWidgetChats() {
  const mobile = state.currentUser.mobile;
  const container = document.getElementById('chatbot-widget-messages'); container.innerHTML = '';
  if (!mobile && state.currentUser.role === 'admin') {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)"><p>Admin chatbot: Type messages to test bot responses.</p></div>';
    return;
  }
  if (!mobile) return;
  try {
    const res = await fetch(`${state.apiBase}/api/chat/${mobile}`); const chats = await res.json();
    if (!chats.length) { container.innerHTML = `<div class="chat-bubble bot-sender"><strong style="display:block;font-size:.7rem;margin-bottom:2px;color:var(--color-primary)">BOT</strong><div>Hello ${state.currentUser.name}! Type "track order" or "hi" to get started.</div></div>`; return; }
    chats.forEach(c => {
      const b = document.createElement('div'); b.className = `chat-bubble ${c.sender === 'customer' ? 'customer-sender' : c.sender === 'bot' ? 'bot-sender' : 'admin-sender'}`;
      const label = c.sender === 'customer' ? 'You' : c.sender === 'bot' ? 'Bot' : 'Tailor';
      b.innerHTML = `<strong style="display:block;font-size:.68rem;margin-bottom:2px;opacity:.8">${label}</strong><div>${c.message}</div><span class="chat-bubble-time">${new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
      container.appendChild(b);
    });
    container.scrollTop = container.scrollHeight;
  } catch (err) { console.error(err); }
}
async function handleWidgetChatSubmit(event) {
  event.preventDefault();
  const inp = document.getElementById('chatbot-widget-input'); const msg = inp.value.trim();
  let mobile = state.currentUser.mobile;
  const sender = state.currentUser.role === 'admin' ? 'customer' : 'customer';
  if (!mobile && state.currentUser.role === 'admin') mobile = 'admin-test';
  if (!msg) return;
  inp.value = '';
  try {
    const res = await fetch(`${state.apiBase}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile, sender, message: msg }) });
    if (res.ok) await loadWidgetChats();
  } catch (err) { console.error(err); }
}
function sendWidgetMessage(text) {
  document.getElementById('chatbot-widget-input').value = text;
  document.querySelector('.chatbot-input-form').dispatchEvent(new Event('submit'));
}//
//