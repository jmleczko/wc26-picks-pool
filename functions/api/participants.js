// GET  /api/participants            -> ["Alice","Bob",...]
// POST /api/participants {name}     -> adds name if new, returns updated list

const KEY = 'wc26:participants';

function safeKey(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'player';
}

export async function onRequestGet({ env }) {
  const raw = await env.PICKS_KV.get(KEY);
  const list = raw ? JSON.parse(raw) : [];
  return Response.json(list);
}

export async function onRequestPost({ env, request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const name = (body.name || '').trim();
  if (!name) return new Response('Missing "name"', { status: 400 });

  const raw = await env.PICKS_KV.get(KEY);
  const list = raw ? JSON.parse(raw) : [];

  if (!list.some(p => safeKey(p) === safeKey(name))) {
    list.push(name);
    await env.PICKS_KV.put(KEY, JSON.stringify(list));
  }

  return Response.json(list);
}
