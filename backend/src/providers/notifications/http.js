// Provider transport only. Raw responses/credentials never become application errors or logs.
async function request(url, options) {
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let data;
    try { data = text.length <= 65536 ? JSON.parse(text) : null; } catch { data = null; }
    const seconds = Number(response.headers.get('retry-after'));
    return { status: response.status, ok: response.ok, data,
      retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 3600000) : 30000 };
  } catch { return { uncertain: true }; }
}
module.exports = { request };
