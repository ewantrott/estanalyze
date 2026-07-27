# ESTAnalyze

A web app that looks up any stock ticker or market index and shows a live
financial snapshot, recent news, and an optional AI-generated summary.

## Data sources (no API keys required)

- **Financials/quote**: Yahoo Finance's public quote endpoints.
- **News**: Google News RSS, filtered by company name.

Both are free, unofficial public endpoints. They're generally reliable but can
occasionally rate-limit or change shape without notice.

## AI summary (optional)

The "AI Analysis" panel calls the Claude API to write a neutral summary of the
fetched financials and news. It's off by default. To enable it:

1. Get an API key from https://console.anthropic.com/
2. Locally: `copy .env.example .env` and paste your key into `ANTHROPIC_API_KEY=`
3. On Render: add `ANTHROPIC_API_KEY` under your service's Environment tab (see below)

Without a key, the app still works — you just won't see the AI summary panel
filled in.

## Run it locally

```bash
npm install
npm start
```

Then open http://localhost:4173

## Deploying to Render (so you can post a real link, e.g. in Discord)

1. Push this project to a GitHub repository (public or private both work).
2. Go to https://render.com, sign up / log in, click **New +** → **Web Service**.
3. Connect the GitHub repo you just pushed (or paste its public URL).
4. Render should auto-detect the settings from `render.yaml`. If not, set manually:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Under the **Environment** tab, add `ANTHROPIC_API_KEY` with your key (kept
   secret, never committed to the repo).
6. Deploy. Render gives you a public URL like `https://estanalyze.onrender.com`
   — that's the link you can paste into Discord; it'll unfurl into a rich
   embed automatically using the site's Open Graph tags.

Notes on the free tier: the service spins down after periods of inactivity and
takes ~30-60s to wake up on the next request — fine for a Discord link people
click occasionally, less fine for constant traffic.

## Notes

- Index symbols use a caret prefix, e.g. `^GSPC` (S&P 500), `^DJI` (Dow),
  `^IXIC` (Nasdaq).
- This app is informational only — it does not give investment advice or
  buy/sell recommendations.
- `SITE_URL` is auto-detected from the incoming request by default, so Open
  Graph/Discord embed tags work correctly on whatever domain you deploy to.
  Only set it manually if you're behind a proxy that hides the original host.
