// GET /api/picks/:name  -> stored picks JSON, or 404 if none saved yet
// PUT /api/picks/:name  -> body is the picks JSON to save

function keyFor(name) {
  const safe = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'player';
  return `wc26:picks:${safe}`;
}

export async function onRequestGet({ env, params }) {
  const raw = await env.PICKS_KV.get(keyFor(params.name));
  if (!raw) return new Response('Not found', { status: 404 });
  return new Response(raw, { headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPut({ env, params, request }) {
  let body;
  try {
    body = await request.text(); // store as-is, it's already JSON from the client
    JSON.parse(body); // validate
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  await env.PICKS_KV.put(keyFor(params.name), body);
  return Response.json({ ok: true });
}
