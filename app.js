const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
const store = {
  get token() { return localStorage.getItem('sn_token'); },
  get user() { return JSON.parse(localStorage.getItem('sn_user') || 'null'); },
  get cart() { return JSON.parse(localStorage.getItem('sn_cart') || '[]'); },
  set cart(c) { localStorage.setItem('sn_cart', JSON.stringify(c)); renderNav(); }
};

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(store.token && { Authorization: `Bearer ${store.token}` }) },
    body: opts.body && JSON.stringify(opts.body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderNav() {
  const u = store.user;
  $('#cartCount').textContent = store.cart.reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('[data-auth]').forEach((a) => a.hidden = !u);
  document.querySelectorAll('[data-admin]').forEach((a) => a.hidden = u?.role !== 'admin');
  $('#loginLink').hidden = !!u; $('#logoutLink').hidden = !u;
}
$('#logoutLink').onclick = (e) => { e.preventDefault(); localStorage.removeItem('sn_token'); localStorage.removeItem('sn_user'); location.hash = '#/'; renderNav(); };

function addToCart(p) {
  const cart = store.cart; const line = cart.find((i) => i.id === p._id);
  if (line) line.qty = Math.min(line.qty + 1, p.stock); else cart.push({ id: p._id, name: p.name, price: p.price, image: p.image, qty: 1 });
  store.cart = cart;
}

// ---------- Views ----------
const routes = {
  async '/'() {
    view.innerHTML = `<h1>Shop</h1>
      <div class="toolbar"><input id="q" placeholder="Search products"><select id="cat"><option value="">All categories</option></select></div>
      <div class="grid" id="grid"><p class="muted">Loading…</p></div>`;
    const all = await api('/api/products');
    [...new Set(all.map((p) => p.category))].forEach((c) => $('#cat').insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`));
    const draw = () => {
      const q = $('#q').value.toLowerCase(), c = $('#cat').value;
      const list = all.filter((p) => p.name.toLowerCase().includes(q) && (!c || p.category === c));
      $('#grid').innerHTML = list.length ? '' : '<p class="muted">No products found.</p>';
      list.forEach((p) => {
        const el = document.createElement('div'); el.className = 'card';
        el.innerHTML = `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"><div class="body">
          <span class="tag">${esc(p.category)}</span><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>
          <div class="row"><span class="price">${inr(p.price)}</span><button ${p.stock ? '' : 'disabled'}>${p.stock ? 'Add to cart' : 'Sold out'}</button></div></div>`;
        $('button', el).onclick = (e) => { addToCart(p); e.target.textContent = 'Added ✓'; setTimeout(() => e.target.textContent = 'Add to cart', 900); };
        $('#grid').appendChild(el);
      });
    };
    $('#q').oninput = draw; $('#cat').onchange = draw; draw();
  },

  cart() {
    const cart = store.cart;
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    view.innerHTML = `<h1>Your cart</h1>${!cart.length ? '<p class="muted">Your cart is empty. <a href="#/">Keep shopping</a></p>' : `
      <div class="panel table-wrap"><table><tr><th>Item</th><th>Price</th><th>Qty</th><th>Subtotal</th><th></th></tr>
      ${cart.map((i, n) => `<tr><td>${esc(i.name)}</td><td>${inr(i.price)}</td>
        <td><input type="number" min="1" value="${i.qty}" data-n="${n}" style="width:70px"></td>
        <td>${inr(i.price * i.qty)}</td><td><button class="secondary" data-rm="${n}">Remove</button></td></tr>`).join('')}
      </table><p class="row"><strong>Total</strong><strong>${inr(total)}</strong></p></div>
      <form class="panel stack narrow" id="checkout"><h3 style="margin:0">Checkout</h3>
        <textarea name="address" placeholder="Shipping address" required rows="3"></textarea>
        <p class="muted" style="margin:0">Payment: Cash on delivery (demo)</p>
        <button>Place order</button><p class="error" id="err"></p></form>`}`;
    view.querySelectorAll('[data-n]').forEach((inp) => inp.onchange = () => { const c = store.cart; c[inp.dataset.n].qty = Math.max(1, +inp.value); store.cart = c; routes.cart(); });
    view.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { const c = store.cart; c.splice(b.dataset.rm, 1); store.cart = c; routes.cart(); });
    const f = $('#checkout');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      if (!store.user) { location.hash = '#/login'; return; }
      try {
        await api('/api/orders', { method: 'POST', body: { address: f.address.value, items: store.cart.map((i) => ({ productId: i.id, qty: i.qty })) } });
        store.cart = []; location.hash = '#/orders';
      } catch (err) { $('#err').textContent = err.message; }
    };
  },

  async orders() {
    if (!store.user) return (location.hash = '#/login');
    const orders = await api('/api/orders/mine');
    view.innerHTML = `<h1>My orders</h1>${orders.length ? orders.map((o) => `
      <div class="panel"><div class="row"><strong>#${o._id.slice(-6).toUpperCase()}</strong><span class="badge">${o.status}</span></div>
      <p class="muted">${new Date(o.createdAt).toLocaleString()}</p>
      ${o.items.map((i) => `<div class="row"><span>${esc(i.name)} × ${i.qty}</span><span>${inr(i.price * i.qty)}</span></div>`).join('')}
      <p class="row"><strong>Total</strong><strong>${inr(o.total)}</strong></p></div>`).join('') : '<p class="muted">No orders yet.</p>'}`;
  },

  login() {
    let mode = 'login';
    view.innerHTML = `<form class="panel stack narrow" id="f"><h1 id="t">Log in</h1>
      <input name="name" placeholder="Full name" hidden><input name="email" type="email" placeholder="Email" required>
      <input name="password" type="password" placeholder="Password (6+ characters)" minlength="6" required>
      <button id="b">Log in</button><p class="error" id="err"></p>
      <a href="#" id="sw">New here? Create an account</a></form>`;
    $('#sw').onclick = (e) => {
      e.preventDefault(); mode = mode === 'login' ? 'register' : 'login';
      $('#t').textContent = $('#b').textContent = mode === 'login' ? 'Log in' : 'Create account';
      $('[name=name]').hidden = mode === 'login'; $('[name=name]').required = mode === 'register';
      e.target.textContent = mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in';
    };
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const d = await api(`/api/auth/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        localStorage.setItem('sn_token', d.token); localStorage.setItem('sn_user', JSON.stringify(d.user));
        renderNav(); location.hash = store.cart.length ? '#/cart' : '#/';
      } catch (err) { $('#err').textContent = err.message; }
    };
  },

  async admin() {
    if (store.user?.role !== 'admin') return (view.innerHTML = '<p class="error">Admins only.</p>');
    const [products, orders] = await Promise.all([api('/api/products'), api('/api/orders')]);
    view.innerHTML = `<h1>Admin dashboard</h1>
      <form class="panel stack" id="pf"><h3 style="margin:0" id="pft">Add product</h3><input type="hidden" name="id">
        <div class="toolbar"><input name="name" placeholder="Name" required><input name="price" type="number" min="0" placeholder="Price (₹)" required>
        <input name="stock" type="number" min="0" placeholder="Stock" required><input name="category" placeholder="Category"></div>
        <input name="image" placeholder="Image URL"><textarea name="description" placeholder="Description" rows="2"></textarea>
        <div class="toolbar"><button>Save product</button><button type="reset" class="secondary">Clear</button></div><p class="error" id="perr"></p></form>
      <h3>Products (${products.length})</h3><div class="table-wrap"><table><tr><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>
        ${products.map((p) => `<tr><td>${esc(p.name)}</td><td>${inr(p.price)}</td><td>${p.stock}</td>
        <td><button class="secondary" data-edit="${p._id}">Edit</button> <button class="danger" data-del="${p._id}">Delete</button></td></tr>`).join('')}</table></div>
      <h3>All orders (${orders.length})</h3><div class="table-wrap"><table><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr>
        ${orders.map((o) => `<tr><td>#${o._id.slice(-6).toUpperCase()}<br><span class="muted">${new Date(o.createdAt).toLocaleDateString()}</span></td>
        <td>${esc(o.user?.name || '—')}<br><span class="muted">${esc(o.user?.email || '')}</span></td>
        <td>${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join('<br>')}</td><td>${inr(o.total)}</td>
        <td><select data-order="${o._id}">${['placed', 'shipped', 'delivered', 'cancelled'].map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table></div>`;
    const f = $('#pf');
    f.onreset = () => { $('#pft').textContent = 'Add product'; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f)); const id = body.id; delete body.id;
      try { await api(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', body }); routes.admin(); }
      catch (err) { $('#perr').textContent = err.message; }
    };
    view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      const p = products.find((x) => x._id === b.dataset.edit);
      ['name', 'price', 'stock', 'category', 'image', 'description'].forEach((k) => f[k].value = p[k] ?? '');
      f.id.value = p._id; $('#pft').textContent = `Edit: ${p.name}`; f.scrollIntoView({ behavior: 'smooth' });
    });
    view.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Delete this product?')) { await api(`/api/products/${b.dataset.del}`, { method: 'DELETE' }); routes.admin(); } });
    view.querySelectorAll('[data-order]').forEach((s) => s.onchange = () => api(`/api/orders/${s.dataset.order}/status`, { method: 'PUT', body: { status: s.value } }));
  }
};

async function router() {
  const key = location.hash.replace(/^#\/?/, '') || '/';
  try { await (routes[key] || routes['/'])(); } catch (e) { view.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', router);
renderNav(); router();
