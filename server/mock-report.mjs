import http from 'node:http';

const PORT = 8787;

const server = http.createServer((req, res) => {
  // 回显请求 Origin，因为 sendBeacon/fetch 带 credentials 时不能用 *
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log(`[${new Date().toISOString()}] Received ${data.events?.length || 1} event(s):`);
        data.events?.forEach((evt, i) => {
          console.log(`  [${i + 1}] type=${evt.type}, subType=${evt.subType || '-'}, level=${evt.level || '-'}`);
          if (evt.exception) {
            const ex = evt.exception.values?.[0];
            console.log(`       exception: ${ex?.type || 'Error'}: ${ex?.value || ''}`);
          }
          if (evt.breadcrumbs) {
            console.log(`       breadcrumbs: ${evt.breadcrumbs.length}`);
          }
          if (evt.rrweb) {
            console.log(`       rrweb events: ${evt.rrweb.length}`);
          }
          if (evt.type === 'performance') {
            console.log(`       data: ${JSON.stringify(evt.data)}`);
          }
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        console.error('Parse error:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: e.message }));
      }
    });
    return;
  }

  // GET 请求（Image 降级走 GET）
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const data = url.searchParams.get('data');
  if (data) {
    try {
      const decoded = decodeURIComponent(data);
      const parsed = JSON.parse(decoded);
      console.log(`[${new Date().toISOString()}] Image beacon received:`, parsed.events?.length || 1, 'event(s)');
    } catch {
      console.log(`[${new Date().toISOString()}] Image beacon received (raw, length=${data.length})`);
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
});

server.listen(PORT, () => {
  console.log(`Mock report server running at http://localhost:${PORT}/report`);
  console.log('Press Ctrl+C to stop');
});
