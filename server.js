const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin Şifresi Güncellendi
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '03omer07';

const KEYS_FILE = path.join(__dirname, 'keys.json');

function getKeys() {
  if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({
      "ACCES-PRO-100-XYZ1": 100,
      "ACCES-VIP-UNLIMITED": 99999
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
}

function saveKeys(keys) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

function authAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'];
  if (pass === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Yetkisiz erişim!' });
  }
}

app.post('/api/verify-key', (req, res) => {
  const { key } = req.body;
  const keys = getKeys();

  if (keys[key] && keys[key] > 0) {
    keys[key] -= 1;
    saveKeys(keys);
    return res.json({ valid: true, remaining: keys[key] });
  }
  return res.json({ valid: false });
});

app.get('/api/admin/keys', authAuth => authAdmin, (req, res) => {
  // Yukarıdaki satır hızlı düzeltme için altta doğru fonksiyona bağlandı
});

// Admin: Key'leri Getir
app.get('/api/admin/keys', authAdmin, (req, res) => {
  res.json(getKeys());
});

// Admin: Yeni Key Üret
app.post('/api/admin/generate-key', authAdmin, (req, res) => {
  const { rights } = req.body;
  const keys = getKeys();
  
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newKey = `ACCES-KEY-${randomStr}`;
  
  keys[newKey] = parseInt(rights) || 100;
  saveKeys(keys);
  
  res.json({ success: true, key: newKey });
});

// Admin: Key Sil / İptal Et
app.post('/api/admin/delete-key', authAdmin, (req, res) => {
  const { key } = req.body;
  const keys = getKeys();

  if (keys[key] !== undefined) {
    delete keys[key];
    saveKeys(keys);
    return res.json({ success: true });
  }
  res.status(404).json({ success: false, error: 'Key bulunamadı' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
