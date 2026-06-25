# World Cup 2026 Picks Pool — Cloudflare Pages + Functions + KV

A friends-pool version of the World Cup picks app, running entirely on Cloudflare:

- **Pages** serves the static frontend (`public/index.html`).
- **Pages Functions** (`functions/api/...`) provide the API — these run on the Workers runtime.
- **Workers KV** stores participant names and everyone's picks.

## Project layout

```
public/
  index.html              # the app (groups, third-place, bracket, compare)
functions/
  api/
    participants.js        # GET/POST list of players
    picks/
      [name].js            # GET/PUT one player's picks
wrangler.toml
package.json
```

## 1. Install Wrangler

```bash
npm install
```

## 2. Create the KV namespace

```bash
npx wrangler kv namespace create wc26_picks
```

This prints an `id`. Paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "PICKS_KV"
id = "paste-the-id-here"
```

## 3. Run it locally

```bash
npm run dev
```

This starts `wrangler pages dev`, which serves `public/` and runs the Functions locally (against a local KV store, so test data won't touch production).

## 4. Deploy

```bash
npx wrangler login        # first time only
npm run deploy
```

Wrangler will create the Pages project on first deploy and give you a `*.pages.dev` URL — that's the link to share with friends.

If you'd rather click through the dashboard instead of the CLI: create the project in **Workers & Pages > Create > Pages**, connect this folder (or a git repo containing it), then go to **Settings > Functions > KV namespace bindings** and add a binding named `PICKS_KV` pointing at the namespace you created in step 2.

## How the API works

| Route | Method | Does |
|---|---|---|
| `/api/participants` | GET | returns the list of player names |
| `/api/participants` | POST `{name}` | adds a player if new |
| `/api/picks/:name` | GET | returns that player's saved picks JSON (404 if none) |
| `/api/picks/:name` | PUT `<picks JSON>` | saves that player's picks |

Everything is stored under two KV key shapes: `wc26:participants` (one JSON array) and `wc26:picks:<safe-name>` (one JSON blob per player). No database needed — KV's read-heavy, low-latency model fits this perfectly since picks are written occasionally but read by everyone on the Compare tab.

## Ideas if you want to go further

- **Durable Objects**: swap the manual "Refresh picks" button for a live-updating Compare tab — one Durable Object per pool, pushing updates over WebSockets to connected clients.
- **D1**: if you want to score picks against real results later, a relational table per match is easier to query than KV blobs.
- **Cloudflare Access**: put the whole site behind an Access policy scoped to your friends' email addresses instead of the honor-system name field.
