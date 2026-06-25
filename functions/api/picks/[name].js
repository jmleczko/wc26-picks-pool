// GET    /api/picks/:name  -> stored picks JSON, or 404 if none saved yet
// PUT    /api/picks/:name  -> body is the picks JSON to save (rejected per-group once that
//                             group's first real match has kicked off — see below)
// DELETE /api/picks/:name  -> removes the stored picks for that name

function keyFor(name) {
  const safe = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'player';
  return `wc26:picks:${safe}`;
}

// Earliest kickoff per group, from whatever wc26-data-sync last wrote. A group with no
// known kickoff yet (fixtures not synced, or a typo'd group code) is treated as unlocked —
// we never lock a group we don't have real data for.
function computeGroupLockTimes(fixtures) {
  const map = {};
  (fixtures || []).forEach(f => {
    if (!f.group || !f.kickoff) return;
    const t = new Date(f.kickoff).getTime();
    if (Number.isNaN(t)) return;
    if (!(f.group in map) || t < map[f.group]) map[f.group] = t;
  });
  return map;
}

export async function onRequestGet({ env, params }) {
  const raw = await env.PICKS_KV.get(keyFor(params.name));
  if (!raw) return new Response('Not found', { status: 404 });
  return new Response(raw, { headers: { 'Content-Type': 'application/json' } });
}

// Per-group automatic locking is OFF for the group stage — honor system for now, per request.
// Flip this back to true once the Round of 32 bracket opens, so picks lock automatically
// the moment each knockout match kicks off. The manual global override (wc26:lock-at)
// below is unaffected by this flag and still works either way.
const GROUP_STAGE_LOCK_ENABLED = false;

export async function onRequestPut({ env, params, request }) {
  // Manual global override, if you ever want to force-lock everything regardless of
  // fixture data (e.g. wc26:lock-at set to a past timestamp in the KV dashboard).
  const globalLockAt = await env.PICKS_KV.get('wc26:lock-at');
  if (globalLockAt && Date.now() >= new Date(globalLockAt).getTime()) {
    return new Response('Picks are locked', { status: 403 });
  }

  let newBody;
  let newPicks;
  try {
    newBody = await request.text(); // store as-is, it's already JSON from the client
    newPicks = JSON.parse(newBody);
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  // Per-group automatic lock: reject the save only if it actually changes a group whose
  // first real match has already kicked off — diffed against what's currently stored, so
  // unrelated edits to still-open groups in the same payload are unaffected.
  if (GROUP_STAGE_LOCK_ENABLED) {
    const [oldRaw, fixturesRaw] = await Promise.all([
      env.PICKS_KV.get(keyFor(params.name)),
      env.PICKS_KV.get('wc26:fixtures'),
    ]);
    const oldPicks = oldRaw ? JSON.parse(oldRaw) : null;

    if (oldPicks) {
      const lockAtByGroup = computeGroupLockTimes(fixturesRaw ? JSON.parse(fixturesRaw) : []);
      const now = Date.now();

      for (const letter of Object.keys(newPicks.groups || {})) {
        const lockTime = lockAtByGroup[letter];
        if (lockTime == null || now < lockTime) continue; // not locked yet, or unknown — allow

        const oldG = oldPicks.groups && oldPicks.groups[letter];
        const newG = newPicks.groups[letter];
        const oldTop2 = (oldG && (oldG.top2 || (Array.isArray(oldG) ? oldG.slice(0, 2) : []))) || [];
        const newTop2 = (newG && newG.top2) || [];
        const oldThird = (oldG && (oldG.third != null ? oldG.third : (Array.isArray(oldG) ? oldG[2] : null))) ?? null;
        const newThird = (newG && newG.third != null ? newG.third : null);

        const top2Changed = JSON.stringify([...oldTop2].sort()) !== JSON.stringify([...newTop2].sort());
        const thirdChanged = oldThird !== newThird;
        if (top2Changed || thirdChanged) {
          return new Response(`Group ${letter} is locked — its first match has already kicked off`, { status: 403 });
        }
      }

      // Wildcard picks: only protect the specific letters that actually changed, and only if
      // that letter's group has already kicked off.
      const oldThirdList = Array.isArray(oldPicks.third) ? oldPicks.third : [];
      const newThirdList = Array.isArray(newPicks.third) ? newPicks.third : [];
      const changedLetters = [...oldThirdList, ...newThirdList].filter(
        l => !(oldThirdList.includes(l) && newThirdList.includes(l))
      );
      for (const letter of new Set(changedLetters)) {
        const lockTime = lockAtByGroup[letter];
        if (lockTime != null && now >= lockTime) {
          return new Response(`Group ${letter}'s wildcard pick is locked — its first match has already kicked off`, { status: 403 });
        }
      }
    }
    // If oldPicks is null (this player's very first save), there's nothing to diff against
    // yet, so the lock check is skipped for that one initial save.
  }

  await env.PICKS_KV.put(keyFor(params.name), newBody);
  return Response.json({ ok: true });
}

export async function onRequestDelete({ env, params }) {
  await env.PICKS_KV.delete(keyFor(params.name));
  return Response.json({ ok: true });
}


