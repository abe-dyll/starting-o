# NFL Divisional Daily Puzzle

Guess the 5 starting skill players (QB, RB, WR1, WR2, TE) for one NFL
team that won its divisional-round playoff game — a new team each day,
picked from every divisional-round winner since 2000. 5 rounds, more
hints each round, fewer points the longer it takes.

## Play it

Visit the deployed site — no setup required.

## Develop locally

```
npm install
npm run dev
```

`npm run dev` runs `vercel dev`, which serves `public/` and the
`api/*.js` serverless functions locally, the same way they run in
production. This requires a one-time `vercel login` and `vercel link`
if you haven't connected this project to Vercel yet.

Set a `ROUND_SECRET` environment variable (any long random string) in
your Vercel project settings (and in a local `.env` file for `vercel
dev`, e.g. `ROUND_SECRET=some-long-random-string`) — it's used to sign
each player's round-progress token.

## Test

```
npm test
```

## Refresh the puzzle data (once a year, after the divisional round is played)

```
npm run pull-data
git add data/puzzles.json
git commit -m "data: refresh divisional-round-winner starter data"
```

This re-fetches every season 2000 through the most recently completed
one from nflverse's public data and regenerates `data/puzzles.json`.
Existing seasons' data doesn't change — this just adds the newest one.

## Deploy

Push to the branch connected to your Vercel project (per your existing
GitHub → Vercel setup) — Vercel builds and deploys automatically.
