const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Veritabanı dosyaları
const USERS_FILE = path.join(__dirname, 'users.json');
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Dosyalar yoksa oluştur
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({}));

function getUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

function getKeys() { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); }
function saveKeys(keys) { fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2)); }

// --- KULLANICI İŞLEMLERİ (KAYIT & GİRİŞ) ---

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ success: false, message: 'Tüm alanları doldurun!' });

  let users = getUsers();
  if (users[email]) return res.json({ success: false, message: 'Bu mail zaten kayıtlı!' });

  users[email] = { password, rights: 10 }; // Yeni kayıt olana başlangıç 10 hak
  saveUsers(users);
  res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  let users = getUsers();

  if (users[email] && users[email].password === password) {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Hatalı mail veya şifre!' });
  }
});

app.get('/api/user-info', (req, res) => {
  const email = req.query.email;
  let users = getUsers();
  if (users[email]) {
    res.json({ success: true, rights: users[email].rights });
  } else {
    res.json({ success: false });
  }
});

// --- SORGULAMA ---
app.post('/api/query', (req, res) => {
  const { email, query } = req.body;
  let users = getUsers();

  if (!users[email] || users[email].rights <= 0) {
    return res.json({ success: false, message: 'Yetersiz hak veya kullanıcı bulunamadı!' });
  }

  users[email].rights -= 1;
  saveUsers(users);

  res.json({
    success: true,
    remainingRights: users[email].rights,
    result: `"${query}" başarıyla sorgulandı.`
  });
});

// --- ADMIN PANELİ İŞLEMLERİ ---

const ADMIN_PASS = '03omer07';

app.get('/api/admin/keys', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Yetkisiz!' });
  }
  // Admin paneli için kullanıcıları listeleyelim (Key/Mail yönetimi)
  let users = getUsers();
  let userMap = {};
  Object.keys(users).forEach(mail => {
    userMap[mail] = users[mail].rights;
  });
  res.json(userMap);
});

app.post('/api/admin/generate-key', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Yetkisiz!' });
  }
  const { rights } = req.body;
  const randomKey = 'DISTRO-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  
  let keys = getKeys();
  keys[randomKey] = rights || 100;
  saveKeys(keys);

  res.json({ success: true, key: randomKey });
});

app.post('/api/admin/delete-key', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Yetkisiz!' });
  }
  const { key } = req.body;
  let users = getUsers();
  if (users[key]) {
    delete users[key];
    saveUsers(users);
  }
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
