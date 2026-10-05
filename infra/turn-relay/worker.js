// Mints short-lived Cloudflare TURN credentials for the game. The TURN key
// secrets stay here; the browser only ever sees credentials that expire.
const TTL_SECONDS = 86_400;

function cors(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET', 'Vary': 'Origin' };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors(origin) });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success)
      return new Response('Too many requests', { status: 429, headers: cors(origin) });

    const upstream = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    }).catch(() => null);
    if (!upstream?.ok) return new Response('TURN unavailable', { status: 502, headers: cors(origin) });

    const { iceServers } = await upstream.json();
    // Browsers block port 53, so those URLs only add a gathering timeout.
    const servers = (Array.isArray(iceServers) ? iceServers : [iceServers]).map(server => ({
      ...server, urls: [server.urls].flat().filter(url => !/:53(\?|$)/.test(url)),
    })).filter(server => server.urls.length);
    return Response.json({ iceServers: servers }, { headers: { ...cors(origin), 'Cache-Control': 'no-store' } });
  },
};
