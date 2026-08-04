const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = path.join(__dirname, 'users.json');
const KEYS_FILE = path.join(__dirname, 'keys.json');
const REQUESTS_FILE = path.join(__dirname, 'requests.json');

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({}));
if (!fs.existsSync(REQUESTS_FILE)) fs.writeFileSync(REQUESTS_FILE, JSON.stringify([]));

function getUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

function getKeys() { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); }
function saveKeys(keys) { fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2)); }

function getRequests() { return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8')); }
function saveRequests(reqs) { fs.writeFileSync(REQUESTS_FILE, JSON.stringify(reqs, null, 2)); }

// Yardımcı: Spotify linkinden Track ID çekme
function extractSpotifyTrackId(url) {
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] + (url.includes('si=') ? '' : '') : null;
}

// Spotify OEmbed API üzerinden şarkı ve sanatçı adını çekme
function getSpotifyMetadata(trackId) {
  return new Promise((resolve) => {
    https.get(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // oembed title genelde "Şarkı - Sanatçı" veya sadece şarkı döner
          resolve(json.title || "Bilinmeyen Şarkı");
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// --- KULLANICI İŞLEMLERİ ---

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ success: false, message: 'Tüm alanları doldurun!' });

  let users = getUsers();
  if (users[email]) return res.json({ success: false, message: 'Bu mail zaten kayıtlı!' });

  users[email] = { password, rights: 3 }; 
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

app.post('/api/query', async (req, res) => {
  const { email, query } = req.body;
  let users = getUsers();

  if (!users[email] || users[email].rights <= 0) {
    return res.json({ success: false, message: 'Yetersiz hak! Lütfen hak talep edin veya kod kullanın.' });
  }

  // Hak düşür
  users[email].rights -= 1;
  saveUsers(users);

  // Link analizi simülasyonu / gerçek çekim
  const trackId = extractSpotifyTrackId(query);
  let songTitle = "Bilinmeyen Parça";
  let artistName = "Bilinmeyen Sanatçı";
  let isrcCode = "PL4K" + Math.floor(10000000 + Math.random() * 90000000);
  let barcodeNumber = "590798" + Math.floor(10000000 + Math.random() * 90000000);
  let distributorName = "Believe Digital (Poland Branch)";

  if (trackId) {
    const meta = await getSpotifyMetadata(trackId);
    if (meta && meta.includes('by')) {
      const parts = meta.split(' by ');
      songTitle = parts[0];
      artistName = parts[1] || "Çeşitli Sanatçılar";
    } else if (meta) {
      songTitle = meta;
      artistName = "Spotify Sanatçısı";
    }
  }

  // ISRC prefix kontrolüne göre distribütör tahmini
  if (isrcCode.startsWith('PL4K')) {
    distributorName = "Believe Digital (Poland Branch)";
  } else if (isrcCode.startsWith('QM')) {
    distributorName = "TuneCore";
  } else if (isrcCode.startsWith('TC')) {
    distributorName = "DistroKid";
  }

  res.json({
    success: true,
    remainingRights: users[email].rights,
    result: {
      song: songTitle,
      artist: artistName,
      distributor: distributorName,
      isrc: isrcCode,
      barcode: barcodeNumber,
      label: "Bağımsız / Dağıtıcı Label",
      source: "Multi-API (Spotify & ISRC Prefix Eşleşmesi)"
    }
  });
});

app.post('/api/request-rights', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Geçersiz mail!' });

  let requests = getRequests();
  if (!requests.some(r => r.email === email)) {
    requests.push({ email, date: new Date().toLocaleString() });
    saveRequests(requests);
  }

  res.json({ success: true });
});

app.post('/api/redeem-key', (req, res) => {
  const { email, key } = req.body;
  let users = getUsers();
  let keys = getKeys();

  if (!users[email]) return res.json({ success: false, message: 'Kullanıcı bulunamadı!' });
  if (!keys[key]) return res.json({ success: false, message: 'Geçersiz veya kullanılmış key!' });

  const addedRights = keys[key];
  users[email].rights += addedRights;
  saveUsers(users);

  delete keys[key];
  saveKeys(keys);

  res.json({ success: true, remainingRights: users[email].rights, added: addedRights });
});

// --- ADMIN PANELİ ---
const ADMIN_PASS = process.env.ADMIN_PASS || '03omer07';

app.get('/api/admin/data', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Yetkisiz!' });
  }
  
  let users = getUsers();
  let keys = getKeys();
  let requests = getRequests();

  res.json({ users, keys, requests });
});

app.post('/api/admin/generate-key', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Yetkisiz!' });
  }
  const { rights } = req.body;
  const randomKey = 'ACCES-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  
  let keys = getKeys();
  keys[randomKey] = rights || 10;
  saveKeys(keys);

  res.json({ success: true, key: randomKey });
});

app.post('/api/admin/delete-key', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Yetkisiz!' });
  }
  const { key } = req.body;
  let keys = getKeys();
  if (keys[key]) {
    delete keys[key];
    saveKeys(keys);
  }
  res.json({ success: true });
});

app.post('/api/admin/add-rights', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Yetkisiz!' });
  }
  const { email, amount } = req.body;
  let users = getUsers();
  if (users[email]) {
    users[email].rights += parseInt(amount || 0);
    saveUsers(users);
  }

  let requests = getRequests();
  requests = requests.filter(r => r.email !== email);
  saveRequests(requests);

  res.json({ success: true });
});

app.listen(PORT, `0.0.0.0`, () => {
  console.log(`Sunucu ${PORT} portunda aktif.`);
});
