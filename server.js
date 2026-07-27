require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const { fetchChart, fetchQuoteSummary, buildQuote, fetchLiteQuote } = require("./src/yahoo");
const { fetchNews } = require("./src/news");
const { analyze, isConfigured } = require("./src/analyze");
const { fetchMarketOverview, fetchTopMovers, fetchRecentMovers } = require("./src/market");
const { searchTickers } = require("./src/search");
const { renderTickerOgImage } = require("./src/ogImage");

const VALID_MOVER_WINDOWS = new Set([10, 30, 60]);

const CHART_RANGES = {
  "1d": { range: "1d", interval: "5m" },
  "1w": { range: "5d", interval: "15m" },
  "1mo": { range: "1mo", interval: "1d" },
  "6mo": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
};

const DEFAULT_TITLE = "ESTAnalyze — Stock & Market Analysis";
const DEFAULT_DESCRIPTION =
  "Look up any stock ticker or market index for a live financial snapshot, recent news, and an AI-generated summary.";
const RESERVED_PATHS = new Set(["api", "favicon.ico", "robots.txt", "sitemap.xml"]);
const STATIC_EXTENSION_RE = /\.(ico|png|jpg|jpeg|svg|css|js|txt|xml|json|map)$/i;

const app = express();
const PORT = process.env.PORT || 4173;
const indexTemplate = fs.readFileSync(path.join(__dirname, "views", "index.html"), "utf8");

// Needed so req.protocol reflects the original https scheme when running
// behind a platform proxy (e.g. Render), not the proxy's internal http hop.
app.set("trust proxy", true);

app.use(express.json());

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function siteUrlFor(req) {
  return (process.env.SITE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

function renderPage({ siteUrl, title, description, canonicalPath = "/", ogImage, initialTicker }) {
  const initialTickerScript = initialTicker
    ? `<script>window.__INITIAL_TICKER__ = ${JSON.stringify(initialTicker)};</script>`
    : "";
  return indexTemplate
    .replaceAll("{{TITLE}}", escapeHtml(title || DEFAULT_TITLE))
    .replaceAll("{{DESCRIPTION}}", escapeHtml(description || DEFAULT_DESCRIPTION))
    .replaceAll("{{CANONICAL_URL}}", `${siteUrl}${canonicalPath}`)
    .replaceAll("{{OG_IMAGE}}", ogImage || `${siteUrl}/og-image.png`)
    .replaceAll("{{INITIAL_TICKER_SCRIPT}}", initialTickerScript);
}

app.get("/", (req, res) => {
  res.type("html").send(renderPage({ siteUrl: siteUrlFor(req) }));
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({ aiConfigured: isConfigured() });
});

app.get("/api/quote/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase().trim();
  try {
    const chart = await fetchChart(ticker);
    const summary = await fetchQuoteSummary(ticker);
    res.json(buildQuote(ticker, chart, summary));
  } catch (err) {
    res.status(404).json({ error: err.message || "Failed to fetch quote" });
  }
});

app.get("/api/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 1) {
    res.json({ results: [] });
    return;
  }
  try {
    const results = await searchTickers(q);
    res.json({ results });
  } catch (err) {
    res.status(502).json({ error: err.message || "Search failed" });
  }
});

const ogImageCache = new Map(); // ticker -> { buffer, expires }
const OG_IMAGE_TTL_MS = 60_000;

app.get("/api/og/:ticker.png", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase().trim();
  const cached = ogImageCache.get(ticker);
  if (cached && cached.expires > Date.now()) {
    res.type("png").set("Cache-Control", "public, max-age=60").send(cached.buffer);
    return;
  }
  try {
    const quote = await fetchLiteQuote(ticker);
    const buffer = await renderTickerOgImage(quote);
    ogImageCache.set(ticker, { buffer, expires: Date.now() + OG_IMAGE_TTL_MS });
    res.type("png").set("Cache-Control", "public, max-age=60").send(buffer);
  } catch {
    res.status(404).end();
  }
});

app.get("/api/chart/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase().trim();
  const uiRange = CHART_RANGES[req.query.range] ? req.query.range : "1mo";
  const { range, interval } = CHART_RANGES[uiRange];
  try {
    const chart = await fetchChart(ticker, range, interval);
    const timestamps = chart.timestamp || [];
    const closes = chart.indicators?.quote?.[0]?.close || [];
    const points = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      if (closes[i] != null) points.push({ t: timestamps[i], c: closes[i] });
    }
    res.json({ range: uiRange, points });
  } catch (err) {
    res.status(404).json({ error: err.message || "Failed to fetch chart data" });
  }
});

app.get("/api/news/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase().trim();
  const query = req.query.q || `${ticker} stock`;
  try {
    const news = await fetchNews(query);
    res.json({ news });
  } catch (err) {
    res.status(502).json({ error: err.message || "Failed to fetch news" });
  }
});

app.get("/api/market-overview", async (req, res) => {
  try {
    const overview = await fetchMarketOverview();
    res.json(overview);
  } catch (err) {
    res.status(502).json({ error: err.message || "Failed to fetch market overview" });
  }
});

app.get("/api/top-movers", async (req, res) => {
  const windowMinutes = Number(req.query.window);
  try {
    const movers = VALID_MOVER_WINDOWS.has(windowMinutes)
      ? await fetchRecentMovers(windowMinutes)
      : await fetchTopMovers();
    res.json(movers);
  } catch (err) {
    res.status(502).json({ error: err.message || "Failed to fetch top movers" });
  }
});

app.get("/api/watchlist-quotes", async (req, res) => {
  const symbols = (req.query.symbols || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30); // sanity cap

  if (!symbols.length) {
    res.json({ quotes: [] });
    return;
  }

  const results = await Promise.allSettled(symbols.map((s) => fetchLiteQuote(s)));
  const quotes = results.map((result, i) =>
    result.status === "fulfilled" ? result.value : { symbol: symbols[i], error: true }
  );
  res.json({ quotes });
});

app.post("/api/analyze", async (req, res) => {
  const { ticker, quote, news } = req.body || {};
  if (!ticker) {
    res.status(400).json({ error: "ticker is required" });
    return;
  }
  try {
    const result = await analyze({ ticker, quote, news });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to generate analysis" });
  }
});

// Shareable per-ticker pages (e.g. /AAPL) with dynamic Discord/social embed
// tags reflecting that ticker's live price. Kept last so it only catches
// paths no static file or /api/* route already handled.
app.get("/:ticker", async (req, res) => {
  const raw = req.params.ticker;
  if (RESERVED_PATHS.has(raw.toLowerCase()) || STATIC_EXTENSION_RE.test(raw)) {
    res.status(404).end();
    return;
  }

  const ticker = raw.toUpperCase();
  const siteUrl = siteUrlFor(req);

  let quote = null;
  try {
    quote = await fetchLiteQuote(ticker);
  } catch {
    // falls through to the generic page below
  }

  if (!quote || quote.price == null) {
    res.status(404).type("html").send(renderPage({ siteUrl }));
    return;
  }

  const sign = quote.change != null && quote.change >= 0 ? "+" : "";
  const changeText =
    quote.change != null && quote.changePercent != null
      ? ` ${sign}${quote.change.toFixed(2)} (${sign}${quote.changePercent.toFixed(2)}%)`
      : "";
  const priceText = `${quote.price.toFixed(2)} ${quote.currency || ""}`.trim();

  res.type("html").send(
    renderPage({
      siteUrl,
      title: `${ticker} — ${quote.name} | ESTAnalyze`,
      description: `${priceText}${changeText} — Live financials, news, and AI analysis for ${quote.name} on ESTAnalyze.`,
      canonicalPath: `/${ticker}`,
      ogImage: `${siteUrl}/api/og/${ticker}.png`,
      initialTicker: ticker,
    })
  );
});

app.listen(PORT, () => {
  console.log(`ESTAnalyze running at http://localhost:${PORT}`);
});
