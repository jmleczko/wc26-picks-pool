// GET  /api/participants -> list of all participants
// POST /api/participants -> CLOSED — registration is closed
// PUT  /api/participants -> update a participant name (rename etc.)

export async function onRequestGet({ env }) {
  const raw = await env.PICKS_KV.get('wc26:participants');
  const list = raw ? JSON.parse(raw) : [];
  return Response.json(list);
}

export async function onRequestPost() {
  // Registration is closed. To manually add someone, edit wc26:participants in the KV dashboard.
  return new Response('Registration is closed', { status: 403 });
}

export async function onRequestPut({ env, request }) {
  const body = await request.json();
  await env.PICKS_KV.put('wc26:participants', JSON.stringify(body));
  return Response.json({ ok: true });
}
