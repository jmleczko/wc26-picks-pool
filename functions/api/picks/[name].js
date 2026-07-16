// GET    /api/picks/:name  -> stored picks JSON, or 404 if none saved yet
// PUT    /api/picks/:name  -> body is the picks JSON to save (rejected per-group once that
//                             group's first real match has kicked off — see below)
// DELETE /api/picks/:name  -> removes the stored picks for that name

function safeKeyName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'player';
}

function keyFor(name) {
  return `wc26:picks:${safeKeyName(name)}`;
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

// "Group A" -> ... already handled above for groups. For the bracket, classify each
// knockout match into one of R32/R16/QF/SF/FINAL the same way the frontend does, then
// compute the two lock gates: all of R32 locks at its earliest kickoff, and R16 through
// the Final all share a single gate at R16's earliest kickoff (picked together in one
// sitting once R16 is real).
function classifyRound(stage) {
  if (!stage) return null;
  const s = stage.toUpperCase();
  if (s.includes('THIRD')) return null;
  if (s.includes('32')) return 'R32';
  if (s.includes('16')) return 'R16';
  if (s.includes('QUARTER')) return 'QF';
  if (s.includes('SEMI')) return 'SF';
  if (s.includes('FINAL')) return 'FINAL';
  return null;
}

function bracketLockGates(fixtures) {
  const r32Times = [];
  const r16Times = [];
  (fixtures || []).forEach(f => {
    if (!f.kickoff) return;
    const round = classifyRound(f.stage);
    const t = new Date(f.kickoff).getTime();
    if (Number.isNaN(t)) return;
    if (round === 'R32') r32Times.push(t);
    if (round === 'R16') r16Times.push(t);
  });
  return {
    r32Gate: r32Times.length ? Math.min(...r32Times) : null,
    r16Gate: r16Times.length ? Math.min(...r16Times) : null,
  };
}

// Which gate (if any) applies to a given match id, based on that match's own round.
function gateForMatch(matchId, fixtures, gates) {
  const f = (fixtures || []).find(x => String(x.id) === String(matchId));
  if (!f) return null;
  const round = classifyRound(f.stage);
  const stage = (f.stage || '').toUpperCase();

  if (round === 'R32') return gates.r32Gate;
  if (round === 'R16') return gates.r16Gate;

  // QF, SF, Final, and Third Place each use their own match kickoff as the gate
  if (round === 'QF' || round === 'SF' || round === 'FINAL' || stage.includes('THIRD')) {
    return f.kickoff ? new Date(f.kickoff).getTime() : null;
  }

  return null;
}

export async function onRequestGet({ env, params }) {
  const raw = await env.PICKS_KV.get(keyFor(params.name));
  if (!raw) return new Response('Not found', { status: 404 });
  return new Response(raw, { headers: { 'Content-Type': 'application/json' } });
}

// Per-group automatic locking is OFF for the group stage — honor system for now, per request.
// Flip this back to true once you want it enforced again. The bracket lock below is a
// SEPARATE, always-on check — bracket picks lock per match at kickoff regardless of this flag.
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

  const [oldRaw, fixturesRaw, lateRaw] = await Promise.all([
    env.PICKS_KV.get(keyFor(params.name)),
    env.PICKS_KV.get('wc26:fixtures'),
    env.PICKS_KV.get('wc26:late-pickers'),
  ]);
  const oldPicks = oldRaw ? JSON.parse(oldRaw) : null;
  const fixtures = fixturesRaw ? JSON.parse(fixturesRaw) : [];

  // Per-name exception list, managed entirely in the KV dashboard (see late-pickers.js).
  // Someone on this list skips every lock check below, the same way a brand-new player's
  // very first save already did — this just extends that same bypass to a name you choose,
  // for as long as they stay on the list, instead of only on save #1.
  let lateList = [];
  if (lateRaw) {
    try {
      const parsed = JSON.parse(lateRaw);
      if (Array.isArray(parsed)) lateList = parsed;
    } catch { /* malformed value — fail safe to "nobody exempted" */ }
  }
  const isLatePicker = lateList.includes(safeKeyName(params.name));

  if (oldPicks && !isLatePicker) {
    // Per-group automatic lock (group stage) — gated behind the honor-system flag above.
    if (GROUP_STAGE_LOCK_ENABLED) {
      const lockAtByGroup = computeGroupLockTimes(fixtures);
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

    // Bracket lock — ALWAYS enforced, independent of the honor-system flag above. Round of
    // 32 locks together at its earliest kickoff; Round of 16 through the Final share a
    // second gate at Round of 16's earliest kickoff. Only a changed pick for an already-
    // locked round gets rejected, so unrelated rounds in the same save still go through.
    const gates = bracketLockGates(fixtures);
    const oldBracket = (oldPicks.bracket && typeof oldPicks.bracket === 'object') ? oldPicks.bracket : {};
    const newBracket = (newPicks.bracket && typeof newPicks.bracket === 'object') ? newPicks.bracket : {};
    const now = Date.now();

    const changedMatchIds = new Set([
      ...Object.keys(oldBracket),
      ...Object.keys(newBracket),
    ].filter(id => oldBracket[id] !== newBracket[id]));

    for (const id of changedMatchIds) {
      const gate = gateForMatch(id, fixtures, gates);
      if (gate != null && now >= gate) {
        return new Response(`This round is locked — it has already started`, { status: 403 });
      }
    }
  }
  // If oldPicks is null (this player's very first save), there's nothing to diff against
  // yet, so all lock checks are skipped for that one initial save.

  await env.PICKS_KV.put(keyFor(params.name), newBody);
  return Response.json({ ok: true });
}

export async function onRequestDelete({ env, params }) {
  await env.PICKS_KV.delete(keyFor(params.name));
  return Response.json({ ok: true });
}


