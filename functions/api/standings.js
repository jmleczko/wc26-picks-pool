// GET /api/standings -> { standings: {A:[...], B:[...], ...}, updatedAt: "ISO string" }
// Reads a snapshot written once a day by the separate wc26-data-sync Worker.
// This function never calls any external API itself — it just serves what's in KV.

export async function onRequestGet({ env }) {
  const [raw, updatedAt] = await Promise.all([
    env.PICKS_KV.get('wc26:standings'),
    env.PICKS_KV.get('wc26:updated-at'),
  ]);

  return Response.json({
    standings: raw ? JSON.parse(raw) : {},
    updatedAt: updatedAt || null,
  });
}
