require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { MONGODB_URI, JWT_SECRET = 'dev-secret', ADMIN_EMAIL = '', PORT = 3000 } = process.env;
const { Schema, model } = mongoose;

// ---------- Models ----------
const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true }));

const Product = model('Product', new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  category: { type: String, default: 'General' },
  image: { type: String, default: '' }
}, { timestamps: true }));

const Order = model('Order', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, name: String, price: Number, qty: Number }],
  total: Number,
  address: { type: String, required: true },
  status: { type: String, enum: ['placed', 'shipped', 'delivered', 'cancelled'], default: 'placed' }
}, { timestamps: true }));

// ---------- App ----------
const app = express();
app.use(express.json());
// Frontend files live at the repo root; only these are served
const PUBLIC_FILES = ['app.js','index.html','style.css'];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/:file', (req, res, next) =>
  PUBLIC_FILES.includes(req.params.file) ? res.sendFile(path.join(__dirname, req.params.file)) : next());

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const sign = (u) => jwt.sign({ id: u._id, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
const pub = (u) => ({ name: u.name, email: u.email, role: u.role });

function auth(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Please log in' }); }
}
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });

// Auth — the email set in ADMIN_EMAIL becomes an admin on signup
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a 6+ character password are required' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'Email already registered' });
  const role = ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';
  const user = await User.create({ name, email, role, password: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: sign(user), user: pub(user) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password)))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(user), user: pub(user) });
}));

// Products — public read, admin write
app.get('/api/products', wrap(async (req, res) => {
  const { q, category } = req.query;
  const filter = {};
  if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (category) filter.category = category;
  res.json(await Product.find(filter).sort({ createdAt: -1 }));
}));
app.get('/api/products/:id', wrap(async (req, res) => {
  const p = await Product.findById(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
}));
app.post('/api/products', auth, adminOnly, wrap(async (req, res) => res.status(201).json(await Product.create(req.body))));
app.put('/api/products/:id', auth, adminOnly, wrap(async (req, res) => {
  const p = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
}));
app.delete('/api/products/:id', auth, adminOnly, wrap(async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// Orders — checkout validates stock and prices on the server
app.post('/api/orders', auth, wrap(async (req, res) => {
  const { items = [], address } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Cart is empty' });
  if (!address) return res.status(400).json({ error: 'Shipping address is required' });
  const lines = [];
  for (const { productId, qty } of items) {
    const p = await Product.findById(productId);
    const n = Math.max(1, parseInt(qty, 10) || 1);
    if (!p) return res.status(400).json({ error: 'A product in your cart no longer exists' });
    if (p.stock < n) return res.status(400).json({ error: `Only ${p.stock} left of ${p.name}` });
    lines.push({ p, n });
  }
  for (const { p, n } of lines) await Product.updateOne({ _id: p._id }, { $inc: { stock: -n } });
  const order = await Order.create({
    user: req.user.id, address,
    items: lines.map(({ p, n }) => ({ product: p._id, name: p.name, price: p.price, qty: n })),
    total: lines.reduce((s, { p, n }) => s + p.price * n, 0)
  });
  res.status(201).json(order);
}));
app.get('/api/orders/mine', auth, wrap(async (req, res) => res.json(await Order.find({ user: req.user.id }).sort({ createdAt: -1 }))));
app.get('/api/orders', auth, adminOnly, wrap(async (req, res) =>
  res.json(await Order.find().populate('user', 'name email').sort({ createdAt: -1 }))));
app.put('/api/orders/:id/status', auth, adminOnly, wrap(async (req, res) => {
  const o = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
  o ? res.json(o) : res.status(404).json({ error: 'Order not found' });
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use((err, req, res, next) => {
  if (['ValidationError', 'CastError'].includes(err.name)) return res.status(400).json({ error: err.message });
  console.error(err); res.status(500).json({ error: 'Server error' });
});

// Demo catalogue so the store isn't empty on first run
const SEED = [
  ['Wireless Earbuds', 'Bluetooth 5.3, 30h battery with case', 1999, 25, 'Electronics', 'https://picsum.photos/seed/earbuds/600/400'],
  ['Mechanical Keyboard', 'Hot-swappable switches, RGB backlight', 3499, 12, 'Electronics', 'https://picsum.photos/seed/keyboard/600/400'],
  ['Cotton Hoodie', 'Heavyweight fleece, relaxed fit', 1299, 40, 'Clothing', 'https://picsum.photos/seed/hoodie/600/400'],
  ['Running Shoes', 'Lightweight mesh, cushioned sole', 2799, 18, 'Footwear', 'https://picsum.photos/seed/shoes/600/400'],
  ['Steel Water Bottle', 'Insulated, keeps drinks cold for 24h', 599, 60, 'Home', 'https://picsum.photos/seed/bottle/600/400'],
  ['Desk Lamp', 'LED, 3 colour temperatures, USB powered', 899, 30, 'Home', 'https://picsum.photos/seed/lamp/600/400']
].map(([name, description, price, stock, category, image]) => ({ name, description, price, stock, category, image }));

mongoose.connect(MONGODB_URI)
  .then(async () => {
    if (!(await Product.estimatedDocumentCount())) await Product.insertMany(SEED);
    app.listen(PORT, () => console.log(`ShopNest running on :${PORT}`));
  })
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
