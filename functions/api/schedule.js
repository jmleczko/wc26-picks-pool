// GET /api/schedule -> { fixtures: [{id, group, home, away, kickoff}], updatedAt: "ISO string" }
// "kickoff" is the only timing info included — there is no score field anywhere in this
// payload, by design, so this endpoint can never leak a result. The frontend works out
// "playing now" vs "playing tomorrow" itself by comparing kickoff times to the viewer's clock.

export async function onRequestGet({ env }) {
  const [raw, updatedAt] = await Promise.all([
    env.PICKS_KV.get('wc26:fixtures'),
    env.PICKS_KV.get('wc26:updated-at'),
  ]);

  return Response.json({
    fixtures: raw ? JSON.parse(raw) : [],
    updatedAt: updatedAt || null,
  });
}
