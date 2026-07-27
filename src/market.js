const { fetchLiteQuote } = require("./yahoo");

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

async function fetchTopMovers(count = 6) {
  const [gainers, losers] = await Promise.all([
    fetchScreener("day_gainers", count).catch(() => []),
    fetchScreener("day_losers", count).catch(() => []),
  ]);
  return { gainers, losers };
}

module.exports = { fetchMarketOverview, fetchTopMovers };
