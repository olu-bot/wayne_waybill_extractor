const API_BASE = 'http://34.130.114.166:8005';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Strip /api/proxy prefix, keep the rest of the path
  const targetPath = req.url.replace(/^\/api\/proxy/, '') || '/';
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

    const apiRes = await fetch(targetUrl, options);
    const data   = await apiRes.json().catch(() => ({}));
    return res.status(apiRes.status).json(data);
  } catch (e) {
    return res.status(502).json({ success: false, error: e.message });
  }
}
