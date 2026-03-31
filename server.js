const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname)));

// ═══════════════════════════════════════════════════
//  ТОХИРГОО
// ═══════════════════════════════════════════════════
const CONFIG = {
  QPAY_ENABLED: false,

  TWILIO_SID:     process.env.TWILIO_SID,
  TWILIO_TOKEN:   process.env.TWILIO_TOKEN,
  TWILIO_FROM:    process.env.TWILIO_FROM,
  TWILIO_ENABLED: process.env.TWILIO_ENABLED === 'true',
  ADMIN_PHONE: '+97688205808',

  ADMIN_PASSWORD: 'aravt2024',
  PORT:           process.env.PORT || 3000,
  MONGODB_URI:    process.env.MONGODB_URI,
};

// ── MongoDB холболт ──
let db;
async function connectDB() {
  const client = new MongoClient(CONFIG.MONGODB_URI);
  await client.connect();
  db = client.db('aravt');
  console.log('✅ MongoDB холбогдлоо');
}
function col() { return db.collection('registrations'); }

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


// ── Admin auth ──
const ADMIN_TOKEN = () => Buffer.from(CONFIG.ADMIN_PASSWORD).toString('base64');
function adminAuth(req, res, next) {
  if (req.headers.authorization !== `Bearer ${ADMIN_TOKEN()}`)
    return res.status(401).json({ error: 'Зөвшөөрөлгүй' });
  next();
}

// ── Дуусах огноо тооцоо ──
function calcEndDate(startDate, days) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── SMS илгээх ──
async function sendSMS(to, message) {
  if (!CONFIG.TWILIO_ENABLED) {
    console.log(`[SMS] → ${to}: ${message}`);
    return;
  }
  try {
    const twilio = require('twilio')(CONFIG.TWILIO_SID, CONFIG.TWILIO_TOKEN);
    await twilio.messages.create({ from: CONFIG.TWILIO_FROM, to, body: message });
    console.log(`SMS илгээгдлээ → ${to}`);
  } catch (e) {
    console.error('SMS алдаа:', e.message);
  }
}

// ═══════════════════════════════════════════════════
//  БҮРТГЭЛ
// ═══════════════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  try {
    const { name, age, phone, duration, startDate, gender } = req.body;
    if (!name || !age || !phone || !duration || !startDate)
      return res.status(400).json({ error: 'Бүх талбарыг бөглөнө үү' });

    const plan = PRICE_MAP[duration];
    if (!plan) return res.status(400).json({ error: 'Буруу хугацаа' });

    const endDate = calcEndDate(startDate, plan.days);

    const reg = {
      id:        uuidv4(),
      name, age, phone,
      gender:    gender || '',
      duration,
      planLabel: plan.label,
      amount:    plan.price,
      days:      plan.days,
      startDate,
      endDate,
      status:    'pending',
      payMethod: 'bank',
      createdAt: new Date().toISOString(),
      paidAt:    null,
    };

    await col().insertOne(reg);

    const genderTxt = gender === 'М' ? 'Эр' : gender === 'Э' ? 'Эм' : '';
    await sendSMS(
      CONFIG.ADMIN_PHONE,
      `🏋 Аравт шинэ бүртгэл!\n👤 ${name} (${age}нас, ${genderTxt})\n📱 ${phone}\n💰 ${plan.label} - ${plan.price.toLocaleString()}₮\n📅 ${startDate} → ${endDate}`
    );

    res.json({
      success:        true,
      registrationId: reg.id,
      amount:         plan.price,
      planLabel:      plan.label,
      endDate,
      qpayEnabled:    CONFIG.QPAY_ENABLED,
    });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── QPay ──
app.get('/api/qpay/check/:invoiceId', (_req, res) => res.json({ paid: false }));
app.post('/api/qpay/callback', async (req, res) => {
  try {
    const { payment_id, invoice_id } = req.body;
    await col().updateOne({ invoiceId: invoice_id }, { $set: { status: 'paid', paidAt: new Date().toISOString(), paymentId: payment_id } });
    res.json({ status: 'received' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === CONFIG.ADMIN_PASSWORD)
    res.json({ success: true, token: ADMIN_TOKEN() });
  else
    res.status(401).json({ success: false, error: 'Нууц үг буруу' });
});

app.get('/api/admin/registrations', adminAuth, async (_req, res) => {
  const data = await col().find().sort({ createdAt: -1 }).toArray();
  res.json(data);
});

app.patch('/api/admin/registrations/:id', adminAuth, async (req, res) => {
  const update = { ...req.body };
  if (req.body.status === 'paid') update.paidAt = new Date().toISOString();
  await col().updateOne({ id: req.params.id }, { $set: update });
  const reg = await col().findOne({ id: req.params.id });
  if (!reg) return res.status(404).json({ error: 'Олдсонгүй' });
  res.json(reg);
});

app.delete('/api/admin/registrations/:id', adminAuth, async (req, res) => {
  await col().deleteOne({ id: req.params.id });
  res.json({ success: true });
});

app.get('/api/admin/stats', adminAuth, async (_req, res) => {
  const data    = await col().find().toArray();
  const today   = new Date().toISOString().slice(0, 10);
  const paid    = data.filter(r => r.status === 'paid');
  const pending = data.filter(r => r.status === 'pending');
  const expiring = paid.filter(r => {
    if (!r.endDate) return false;
    const diff = (new Date(r.endDate) - new Date(today)) / 86400000;
    return diff >= 0 && diff <= 3;
  });
  const expired = paid.filter(r => r.endDate && r.endDate < today);
  res.json({
    total:    data.length,
    paid:     paid.length,
    pending:  pending.length,
    expiring: expiring.length,
    expired:  expired.length,
    revenue:  paid.reduce((s, r) => s + (r.amount || 0), 0),
  });
});

// ═══════════════════════════════════════════════════
connectDB().then(() => {
  app.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`\n✅  Аравт Фитнесс сервер ажиллаж байна`);
    console.log(`    Port: ${CONFIG.PORT}\n`);
  });
}).catch(err => {
  console.error('MongoDB холбогдсонгүй:', err.message);
  process.exit(1);
});
