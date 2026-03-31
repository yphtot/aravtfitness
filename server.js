const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname)));

// ═══════════════════════════════════════════════════
//  ТОХИРГОО
// ═══════════════════════════════════════════════════
const CONFIG = {
  // QPay merchant герээ байгуулсны дараа дараах 3 мөрийг бөглөнө:
  // QPAY_USERNAME:     'таны_username',
  // QPAY_PASSWORD:     'таны_password',
  // QPAY_INVOICE_CODE: 'таны_invoice_code',
  QPAY_ENABLED:   false,           // QPay идэвхжүүлэх: false → true болгоно

  ADMIN_PASSWORD: 'aravt2024',     // Admin нууц үг — өөрчилж болно
  PORT:           3000,
  DATA_FILE:      path.join(__dirname, 'data', 'registrations.json'),
};

// ── Үнийн жагсаалт ──
const PRICE_MAP = {
  '1day':    { label: '1 өдрийн',               price: 10000,  days: 1  },
  '14child': { label: '14 хоногийн (14-18 нас)', price: 45000,  days: 14 },
  '14adult': { label: '14 хоногийн (19+ нас)',   price: 60000,  days: 14 },
  '1mchild': { label: '1 сарын (14-18 нас)',      price: 90000,  days: 30 },
  '1madult': { label: '1 сарын (19+ нас)',        price: 120000, days: 30 },
  '3mchild': { label: '3 сарын (14-18 нас)',      price: 200000, days: 90 },
  '3madult': { label: '3 сарын (19+ нас)',        price: 300000, days: 90 },
};

// ── Мэдээлэл хадгалах ──
function loadData() {
  try {
    const dir = path.dirname(CONFIG.DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(CONFIG.DATA_FILE)) fs.writeFileSync(CONFIG.DATA_FILE, '[]');
    return JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf8'));
  } catch { return []; }
}
function saveData(data) {
  fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Admin auth ──
const ADMIN_TOKEN = () => Buffer.from(CONFIG.ADMIN_PASSWORD).toString('base64');
function adminAuth(req, res, next) {
  if (req.headers.authorization !== `Bearer ${ADMIN_TOKEN()}`)
    return res.status(401).json({ error: 'Зөвшөөрөлгүй' });
  next();
}

// ═══════════════════════════════════════════════════
//  БҮРТГЭЛ — бүртгэл хадгалж, банк шилжүүлгийн
//  мэдээлэл буцаана (QPay-гүй горим)
// ═══════════════════════════════════════════════════
app.post('/api/register', (req, res) => {
  try {
    const { name, age, phone, duration, startDate, gender } = req.body;
    if (!name || !age || !phone || !duration || !startDate)
      return res.status(400).json({ error: 'Бүх талбарыг бөглөнө үү' });

    const plan = PRICE_MAP[duration];
    if (!plan) return res.status(400).json({ error: 'Буруу хугацаа' });

    const reg = {
      id:        uuidv4(),
      name, age, phone, gender: gender || '',
      duration,
      planLabel: plan.label,
      amount:    plan.price,
      days:      plan.days,
      startDate,
      status:    'pending',
      payMethod: 'bank',
      createdAt: new Date().toISOString(),
      paidAt:    null,
    };

    const data = loadData();
    data.push(reg);
    saveData(data);

    res.json({
      success:        true,
      registrationId: reg.id,
      amount:         plan.price,
      planLabel:      plan.label,
      name:           name,
      qpayEnabled:    CONFIG.QPAY_ENABLED,
    });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── QPay төлбөр шалгах (QPay идэвхтэй үед ашиглана) ──
app.get('/api/qpay/check/:invoiceId', (_req, res) => {
  res.json({ paid: false });
});

// ── QPay callback ──
app.post('/api/qpay/callback', (req, res) => {
  try {
    const { payment_id, invoice_id } = req.body;
    const data = loadData();
    const reg = data.find(r => r.invoiceId === invoice_id);
    if (reg) {
      reg.status    = 'paid';
      reg.paidAt    = new Date().toISOString();
      reg.paymentId = payment_id;
      saveData(data);
    }
    res.json({ status: 'received' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === CONFIG.ADMIN_PASSWORD)
    res.json({ success: true, token: ADMIN_TOKEN() });
  else
    res.status(401).json({ success: false, error: 'Нууц үг буруу' });
});

app.get('/api/admin/registrations', adminAuth, (_req, res) => {
  res.json([...loadData()].reverse());
});

app.patch('/api/admin/registrations/:id', adminAuth, (req, res) => {
  const data = loadData();
  const reg = data.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Олдсонгүй' });
  Object.assign(reg, req.body);
  if (req.body.status === 'paid' && !reg.paidAt) reg.paidAt = new Date().toISOString();
  saveData(data);
  res.json(reg);
});

app.delete('/api/admin/registrations/:id', adminAuth, (req, res) => {
  saveData(loadData().filter(r => r.id !== req.params.id));
  res.json({ success: true });
});

app.get('/api/admin/stats', adminAuth, (_req, res) => {
  const data    = loadData();
  const paid    = data.filter(r => r.status === 'paid');
  const pending = data.filter(r => r.status === 'pending');
  res.json({
    total:   data.length,
    paid:    paid.length,
    pending: pending.length,
    revenue: paid.reduce((s, r) => s + (r.amount || 0), 0),
  });
});

// ═══════════════════════════════════════════════════
app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`\n✅  Аравт Фитнесс сервер ажиллаж байна`);
  console.log(`    Вэбсайт: http://192.168.1.12:${CONFIG.PORT}`);
  console.log(`    Admin:   http://192.168.1.12:${CONFIG.PORT}/admin.html`);
  console.log(`\n    [QPay одоогоор идэвхгүй — герээ байгуулсны дараа тохируулна]\n`);
});
