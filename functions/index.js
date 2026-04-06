const functions = require('firebase-functions');
const fetch     = require('node-fetch');

const API_BASE = 'http://34.130.114.166:8005';

exports.proxy = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Strip the leading /api from the path
  const targetPath = req.path.replace(/^\/api/, '');
  const targetUrl  = API_BASE + targetPath;

  try {
    const options = {
      method:  req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    req.headers['x-api-key'] || '',
      },
    };

    if (req.method === 'POST' && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const apiRes  = await fetch(targetUrl, options);
    const data    = await apiRes.json().catch(() => ({}));
    res.status(apiRes.status).json(data);
  } catch (e) {
    res.status(502).json({ success: false, error: e.message });
  }
});
