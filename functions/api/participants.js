// GET  /api/participants                          -> [{name, avatar}, ...]
// POST /api/participants {name, avatar?}           -> adds name if new (with the given
//                                                      avatar assigned once, randomly,
//                                                      by the frontend); never overwrites
//                                                      an avatar a participant already has
// PUT  /api/participants {oldName, newName}        -> renames an entry (keeps its avatar),
//                                                      returns updated list
//
// Older entries saved before avatars existed are plain strings ("John") rather than
// objects ({name:"John", avatar:null}) — normalize() upgrades those on read so nothing
// from before this feature breaks.

const KEY = 'wc26:participants';

function safeKey(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'player';
}

function normalize(list) {
  return (list || []).map(p => (typeof p === 'string' ? { name: p, avatar: null } : p));
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
  const avatar = typeof body.avatar === 'string' ? body.avatar.trim() : null;
  if (!name) return new Response('Missing "name"', { status: 400 });

  const raw = await env.PICKS_KV.get(KEY);
  let list = normalize(raw ? JSON.parse(raw) : []);

  const existing = list.find(p => safeKey(p.name) === safeKey(name));
  if (existing) {
    if (avatar && !existing.avatar) existing.avatar = avatar; // fill in only if not already set
  } else {
    list.push({ name, avatar: avatar || null });
  }

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

  const oldEntry = list.find(p => safeKey(p.name) === safeKey(oldName));
  const carriedAvatar = oldEntry ? oldEntry.avatar : null;

  // Drop any entry matching either the old name or a name that already collides with the
  // new one (so renaming "John" to an existing "Jon" doesn't leave a duplicate), then add
  // the new name back in once, carrying over whichever avatar they'd already picked.
  list = list.filter(p => safeKey(p.name) !== safeKey(oldName) && safeKey(p.name) !== safeKey(newName));
  list.push({ name: newName, avatar: carriedAvatar });

  await env.PICKS_KV.put(KEY, JSON.stringify(list));
  return Response.json(list);
}
