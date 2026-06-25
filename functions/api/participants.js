// GET  /api/participants            -> ["Alice","Bob",...]
// POST /api/participants {name}     -> adds name if new, returns updated list
// PUT  /api/participants {oldName,newName} -> renames an entry, returns updated list

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

export async function onRequestPut({ env, request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const oldName = (body.oldName || '').trim();
  const newName = (body.newName || '').trim();
  if (!oldName || !newName) return new Response('Missing "oldName" or "newName"', { status: 400 });

  const raw = await env.PICKS_KV.get(KEY);
  let list = raw ? JSON.parse(raw) : [];

  // Drop any entry matching either the old name or a name that already collides with the
  // new one (so renaming "John" to an existing "Jon" doesn't leave a duplicate), then add
  // the new name back in once.
  list = list.filter(p => safeKey(p) !== safeKey(oldName) && safeKey(p) !== safeKey(newName));
  list.push(newName);

  await env.PICKS_KV.put(KEY, JSON.stringify(list));
  return Response.json(list);
}

