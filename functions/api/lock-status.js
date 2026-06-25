// GET /api/lock-status -> { lockAt: "ISO string" | null, locked: boolean }
//
// "wc26:lock-at" is a plain ISO datetime string you set yourself in the KV dashboard —
// not JSON, just type the date/time directly as the value (e.g. 2026-06-25T18:00:00Z).
// Once that moment passes, picks are locked everywhere: the UI disables editing, and the
// PUT handler in picks/[name].js independently refuses to save changes regardless of what
// the frontend does — so this can't be bypassed by calling the API directly.

export async function onRequestGet({ env }) {
  const lockAt = await env.PICKS_KV.get('wc26:lock-at');
  const locked = !!lockAt && Date.now() >= new Date(lockAt).getTime();
  return Response.json({ lockAt: lockAt || null, locked });
}
