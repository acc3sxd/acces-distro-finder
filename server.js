const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const CLIENT_ID = '228167a24a3a410cba364cfe15878301';
const CLIENT_SECRET = '428dd9bfb46d4c8e9c56a04f7f0cbd1d';

// ADMIN ŞİFREN (Bunu kimseye verme!)
const ADMIN_PASSWORD = '03omer07'; 

// Key Veritabanı (Bellekte tutulur)
// Key | Sorgu Hakkı | Kullanıldı mı?
const validKeys = {
  'ACCES-PRO-100-XYZ1': { credits: 100, isUsed: false, createdAt: new Date().toLocaleDateString() },
  'ACCES-VIP-UNLIMITED': { credits: 99999, isUsed: false, createdAt: new Date().toLocaleDateString() }
};

const fallbackPrefixes = [
  { code: 'QT5M', name: 'FreshTunes' },
  { code: 'QT8BW', name: 'FreshTunes' },
  { code: 'PL4K', name: 'Believe Digital (Poland Branch)' },
  { code: 'PL', name: 'Polonya Bağımsız Dağıtım Ağı' },
  { code: 'QZME', name: 'DistroKid' },
  { code: 'QZFY', name: 'DistroKid' },
  { code: 'QZNW', name: 'DistroKid' },
  { code: 'USCG', name: 'TuneCore' },
  { code: 'US2S', name: 'CD Baby' },
  { code: 'FR6X', name: 'Believe Digital' },
  { code: 'SE6', name: 'Amuse' },
  { code: 'USUY', name: 'ONErpm' },
  { code: 'QT', name: 'FreshTunes / Independent Network' },
  { code: 'QZ', name: 'DistroKid / Custom Registry' },
  { code: 'TC', name: 'TuneCore' }
];

async function getToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token;
}

// === KULLANICI API'LERİ ===

// Key Kullanma
app.post('/api/redeem-key', (req, res) => {
  const { userKey } = req.body;
  const keyData = validKeys[userKey];

  if (keyData) {
    if (keyData.isUsed) {
      return res.status(400).json({ success: false, error: 'Bu Key daha önce kullanılmış!' });
    }
    keyData.isUsed = true; // Key'i kullanıldı olarak işaretle
    return res.json({ success: true, credits: keyData.credits });
  } else {
    return res.status(400).json({ success: false, error: 'Geçersiz Lisans Key!' });
  }
});

// Spotify Sorgu
app.post('/api/check', async (req, res) => {
  const { trackUrl } = req.body;
  const match = trackUrl ? trackUrl.match(/track[\/:]([a-zA-Z0-9]{22})/) : null;
  
  if (!match) return res.status(400).json({ error: "Geçersiz Spotify Linki!" });

  try {
    const token = await getToken();
    const trackId = match[1];

    const tRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const tData = await tRes.json();

    const aRes = await fetch(`https://api.spotify.com/v1/albums/${tData.album.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const aData = await aRes.json();

    const isrc = tData.external_ids?.isrc || '';
    const upc = aData.external_ids?.upc || aData.external_ids?.ean || '';
    const pLine = aData.copyrights?.find(c => c.type === 'P')?.text || "";

    let distro = null;
    let source = "Telif & Prefix Analizi";

    if (isrc) {
      try {
        const dRes = await fetch(`https://api.deezer.com/2.0/track/isrc:${isrc}`);
        if (dRes.ok) {
          const dData = await dRes.json();
          if (dData.label) {
            distro = dData.label;
            source = "Deezer Public API";
          }
        }
      } catch (e) {}
    }

    if (!distro) {
      const cleanIsrc = isrc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      for (const item of fallbackPrefixes) {
        if (cleanIsrc.startsWith(item.code)) {
          distro = item.name;
          source = `Prefix Eşleşmesi (${item.code})`;
          break;
        }
      }
    }

    if (!distro) distro = "Bağımsız / Bilinmeyen Distribütör";

    res.json({
      title: tData.name,
      artist: tData.artists.map(a => a.name).join(', '),
      distro: distro,
      isrc: isrc || 'Yok',
      upc: upc || 'Yok',
      label: aData.label || 'Girilmemiş',
      source: source
    });

  } catch (e) {
    res.status(500).json({ error: "Sunucu hatası oluştu." });
  }
});

// === ADMIN PANELİ API'LERİ ===

// Admin Girişi & Key Listesi
app.post('/api/admin/list', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Hatalı Şifre!' });
  res.json({ keys: validKeys });
});

// Yeni Key Oluşturma
app.post('/api/admin/create-key', (req, res) => {
  const { password, credits } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Hatalı Şifre!' });

  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newKey = `ACCES-KEY-${randomStr}`;
  
  validKeys[newKey] = {
    credits: parseInt(credits) || 100,
    isUsed: false,
    createdAt: new Date().toLocaleDateString()
  };

  res.json({ success: true, newKey: newKey });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Acces Distro Finder http://localhost:${PORT} adresinde çalışıyor!`));