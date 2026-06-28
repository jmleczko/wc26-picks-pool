// GET  /api/participants                    -> [{name}, ...]
// POST /api/participants {name}             -> adds name if new, returns the updated list
// PUT  /api/participants {oldName, newName} -> renames an entry, returns updated list
//
// No avatar field exists in this data model at all — that feature was tried and rolled
// back. normalize() also strips an `avatar` key from any legacy entry still carrying one
// (from plain strings, or from objects saved while the avatar feature was live), so the
// format self-heals back to clean {name}-only objects on ordinary traffic, not just after
// a manual KV edit.

const KEY = 'wc26:participants';

function safeKey(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'player';
}

function normalize(list) {
  return (list || []).map(p => (typeof p === 'string' ? { name: p } : { name: p.name }));
}

export async function onRequestGet({ env }) {
  const raw = await env.PICKS_KV.get(KEY);
  const list = normalize(raw ? JSON.parse(raw) : []);
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
  let list = normalize(raw ? JSON.parse(raw) : []);

  const exists = list.some(p => safeKey(p.name) === safeKey(name));
  if (!exists) list.push({ name });

  await env.PICKS_KV.put(KEY, JSON.stringify(list));
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
  let list = normalize(raw ? JSON.parse(raw) : []);

  // Drop any entry matching either the old name or a name that already collides with the
  // new one (so renaming "John" to an existing "Jon" doesn't leave a duplicate), then add
  // the new name back in once.
  list = list.filter(p => safeKey(p.name) !== safeKey(oldName) && safeKey(p.name) !== safeKey(newName));
  list.push({ name: newName });

  await env.PICKS_KV.put(KEY, JSON.stringify(list));
  return Response.json(list);
}
