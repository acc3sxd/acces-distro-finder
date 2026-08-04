const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CLIENT_ID = '228167a24a3a410cba364cfe15878301';
const CLIENT_SECRET = '428dd9bfb46d4c8e9c56a04f7f0cbd1d';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getSpotifyToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  if (data.access_token) {
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000) - 60000;
    return cachedToken;
  } else {
    throw new Error('Spotify Token alınamadı!');
  }
}

app.post('/api/check-distro', async (req, res) => {
  const { trackId } = req.body;
  if (!trackId) return res.json({ success: false, message: 'Geçersiz track ID' });

  try {
    const token = await getSpotifyToken();

    // Şarkı Bilgisi
    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const trackData = await trackRes.json();

    if (!trackData || !trackData.album) {
      return res.json({ success: false, message: 'Spotify\'da şarkı bulunamadı!' });
    }

    // Albüm Bilgisi
    const albumRes = await fetch(`https://api.spotify.com/v1/albums/${trackData.album.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const albumData = await albumRes.json();

    res.json({
      success: true,
      track: {
        name: trackData.name,
        artists: trackData.artists.map(a => a.name).join(', '),
        isrc: trackData.external_ids?.isrc || null,
        upc: albumData?.external_ids?.upc || albumData?.external_ids?.ean || null,
        label: albumData?.label || null,
        copyrights: albumData?.copyrights || []
      }
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Sunucu tarafında hata oluştu.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu ${PORT} portunda aktif!`);
});
