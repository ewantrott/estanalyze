require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const { fetchChart, fetchQuoteSummary, buildQuote } = require("./src/yahoo");
const { fetchNews } = require("./src/news");
const { analyze, isConfigured } = require("./src/analyze");

const app = express();
const PORT = process.env.PORT || 4173;
const indexTemplate = fs.readFileSync(path.join(__dirname, "views", "index.html"), "utf8");

// Needed so req.protocol reflects the original https scheme when running
// behind a platform proxy (e.g. Render), not the proxy's internal http hop.
app.set("trust proxy", true);

app.use(express.json());

app.get("/", (req, res) => {
  const siteUrl = (process.env.SITE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  res.type("html").send(indexTemplate.replaceAll("{{SITE_URL}}", siteUrl));
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

app.listen(PORT, () => {
  console.log(`ESTAnalyze running at http://localhost:${PORT}`);
});
