const { fetchLiteQuote, fetchChart } = require("./yahoo");

const SCREENER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const INDEXES = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^RUT", label: "Russell 2000" },
];

// SPDR Select Sector ETFs, standard proxies for S&P 500 sector performance.
const SECTORS = [
  { symbol: "XLK", label: "Technology" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLV", label: "Health Care" },
  { symbol: "XLY", label: "Consumer Discretionary" },
  { symbol: "XLP", label: "Consumer Staples" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLB", label: "Materials" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLC", label: "Communication Services" },
];

async function fetchGroup(items) {
  const results = await Promise.allSettled(items.map((item) => fetchLiteQuote(item.symbol)));
  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return { ...result.value, label: items[i].label };
    }
    return { symbol: items[i].symbol, label: items[i].label, error: true };
  });
}

async function fetchMarketOverview() {
  const [indexes, sectors] = await Promise.all([fetchGroup(INDEXES), fetchGroup(SECTORS)]);
  return { indexes, sectors };
}

// Yahoo's predefined stock screeners (day_gainers/day_losers), used for a
// lightweight "top movers" feed. Works without the session/crumb dance
// full quoteSummary needs.
async function fetchScreener(scrId, count = 6) {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=${encodeURIComponent(
    scrId
  )}&count=${count}`;
  const res = await fetch(url, { headers: SCREENER_HEADERS });
  if (!res.ok) throw new Error(`Screener request failed (${res.status})`);
  const data = await res.json();
  const quotes = data?.finance?.result?.[0]?.quotes || [];
  return quotes.map((q) => ({
    symbol: q.symbol,
    name: q.shortName || q.longName || q.symbol,
    price: q.regularMarketPrice ?? null,
    change: q.regularMarketChange ?? null,
    changePercent: q.regularMarketChangePercent ?? null,
  }));
}

// The screener response has no historical prices, so sparklines for the
// day view are filled in with one extra lightweight chart fetch per symbol.
async function attachSparklines(items) {
  const results = await Promise.allSettled(
    items.map((item) => fetchChart(item.symbol, "5d").then((chart) => ({
      symbol: item.symbol,
      sparkline: (chart?.indicators?.quote?.[0]?.close || []).filter((c) => c != null),
    })))
  );
  const sparklines = new Map();
  results.forEach((r) => {
    if (r.status === "fulfilled") sparklines.set(r.value.symbol, r.value.sparkline);
  });
  return items.map((item) => ({ ...item, sparkline: sparklines.get(item.symbol) || [] }));
}

async function fetchTopMovers(count = 6) {
  const [gainers, losers] = await Promise.all([
    fetchScreener("day_gainers", count).catch(() => []),
    fetchScreener("day_losers", count).catch(() => []),
  ]);
  const [gainersWithSparklines, losersWithSparklines] = await Promise.all([
    attachSparklines(gainers),
    attachSparklines(losers),
  ]);
  return { gainers: gainersWithSparklines, losers: losersWithSparklines };
}

// Curated universe for the intraday (10m/30m/1h) filters. Yahoo has no
// "recent movers" endpoint, so this scans a fixed set of large, liquid
// stocks with 1-minute bars rather than the whole market (which would mean
// thousands of unofficial API calls per request).
const RECENT_MOVERS_UNIVERSE = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "JPM", "V",
  "UNH", "XOM", "JNJ", "WMT", "MA", "PG", "HD", "CVX", "MRK", "ABBV",
  "KO", "PEP", "COST", "AVGO", "ADBE", "CRM", "NFLX", "AMD", "INTC", "BAC",
  "DIS", "PFE", "TMO", "CSCO", "ORCL", "ABT", "NKE", "MCD", "LLY", "WFC",
];

// Given 1-minute intraday bars, compute % change from ~windowMinutes ago
// (relative to the most recent bar, not wall-clock time, so it degrades
// gracefully outside market hours) to the latest bar.
function windowedChange(chart, windowMinutes) {
  const timestamps = chart?.timestamp || [];
  const closes = chart?.indicators?.quote?.[0]?.close || [];

  const points = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    if (closes[i] != null) points.push({ t: timestamps[i], c: closes[i] });
  }
  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const cutoff = latest.t - windowMinutes * 60;

  let reference = points[0];
  for (const p of points) {
    if (p.t <= cutoff) reference = p;
    else break;
  }
  if (!reference.c) return null;

  const change = latest.c - reference.c;
  return { price: latest.c, change, changePercent: (change / reference.c) * 100 };
}

async function fetchRecentMovers(windowMinutes, count = 6) {
  const results = await Promise.allSettled(
    RECENT_MOVERS_UNIVERSE.map(async (symbol) => {
      const chart = await fetchChart(symbol, "1d", "1m");
      const stats = windowedChange(chart, windowMinutes);
      if (!stats) throw new Error("insufficient intraday data");
      const meta = chart.meta || {};
      const closes = (chart?.indicators?.quote?.[0]?.close || []).filter((c) => c != null);
      return {
        symbol,
        name: meta.longName || meta.shortName || symbol,
        price: stats.price,
        change: stats.change,
        changePercent: stats.changePercent,
        sparkline: closes,
      };
    })
  );

  const valid = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const sorted = [...valid].sort((a, b) => b.changePercent - a.changePercent);

  const gainers = sorted.slice(0, count);
  const losers = sorted
    .slice(-count)
    .reverse()
    .filter((item) => !gainers.includes(item));

  return { gainers, losers };
}

module.exports = { fetchMarketOverview, fetchTopMovers, fetchRecentMovers };
