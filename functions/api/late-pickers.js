// GET /api/late-pickers -> ["safe_key", ...]
//
// A small allowlist of player names (in the same lowercased/underscored "safe key" format
// as wc26:picks:<safekey>) who are exempt from the bracket round-lock gates. Manage it
// entirely from the KV dashboard: edit "wc26:late-pickers" as a plain JSON array of
// strings, e.g. ["jane_doe","bob_smith"]. Add a name to let that one person pick past a
// locked round; remove it to put them back under the normal lock like everyone else.
// No redeploy needed for either direction — this is just a KV read.
//
// This does NOT touch the global wc26:lock-at switch or the kickoff-time gate math at
// all. It only adds a per-name exception that both this read (for the frontend) and the
// PUT handler in picks/[name].js (for the actual enforcement) check independently.

export async function onRequestGet({ env }) {
  const raw = await env.PICKS_KV.get('wc26:late-pickers');
  let list = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed.filter(x => typeof x === 'string');
    } catch {
      list = []; // malformed value in KV — fail safe to "nobody exempted" rather than error
    }
  }
  return Response.json(list);
}
