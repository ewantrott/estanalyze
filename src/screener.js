const { fetchAuthenticated } = require("./yahoo");

// Yahoo's Finance sector taxonomy (verified against the live API - these
// exact strings, not GICS names). Sent to the frontend so the dropdown
// can't drift out of sync with what the backend actually filters on.
const SECTORS = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Energy",
  "Industrials",
  "Basic Materials",
  "Real Estate",
  "Utilities",
  "Communication Services",
];

// Major US exchanges only. Without this, results include thin foreign
// cross-listings (e.g. a Colombian-exchange ADR of Apple with a wildly
// distorted P/E) and OTC pink-sheet tickers that aren't useful for a
// screener aimed at normal retail trading.
const MAJOR_US_EXCHANGES = ["NMS", "NYQ", "NGM", "ASE"];

const SORT_FIELDS = {
  marketCap: "intradaymarketcap",
  changePercent: "percentchange",
  volume: "dayvolume",
  price: "intradayprice",
  peRatio: "peratio.lasttwelvemonths",
  dividendYield: "dividendyield",
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function runScreener(filters = {}) {
  const operands = [
    {
      operator: "or",
      operands: MAJOR_US_EXCHANGES.map((ex) => ({ operator: "eq", operands: ["exchange", ex] })),
    },
  ];

  if (filters.sector) operands.push({ operator: "eq", operands: ["sector", filters.sector] });

  const marketCapMin = num(filters.marketCapMin);
  const marketCapMax = num(filters.marketCapMax);
  if (marketCapMin != null) operands.push({ operator: "GT", operands: ["intradaymarketcap", marketCapMin] });
  if (marketCapMax != null) operands.push({ operator: "LT", operands: ["intradaymarketcap", marketCapMax] });

  const peMin = num(filters.peMin);
  const peMax = num(filters.peMax);
  if (peMin != null) operands.push({ operator: "GT", operands: ["peratio.lasttwelvemonths", peMin] });
  if (peMax != null) operands.push({ operator: "LT", operands: ["peratio.lasttwelvemonths", peMax] });

  const dividendYieldMin = num(filters.dividendYieldMin);
  if (dividendYieldMin != null) operands.push({ operator: "GT", operands: ["dividendyield", dividendYieldMin] });

  const priceMin = num(filters.priceMin);
  const priceMax = num(filters.priceMax);
  if (priceMin != null) operands.push({ operator: "GT", operands: ["intradayprice", priceMin] });
  if (priceMax != null) operands.push({ operator: "LT", operands: ["intradayprice", priceMax] });

  const volumeMin = num(filters.volumeMin);
  if (volumeMin != null) operands.push({ operator: "GT", operands: ["dayvolume", volumeMin] });

  const sortField = SORT_FIELDS[filters.sortField] || SORT_FIELDS.marketCap;
  const sortType = filters.sortDir === "ASC" ? "ASC" : "DESC";

  const body = {
    size: 25,
    offset: 0,
    sortField,
    sortType,
    quoteType: "EQUITY",
    query: { operator: "AND", operands },
  };

  const res = await fetchAuthenticated("https://query1.finance.yahoo.com/v1/finance/screener?lang=en-US&region=US", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Screener request failed (${res.status})`);
  const data = await res.json();
  const result = data?.finance?.result?.[0] || {};
  const quotes = result.quotes || [];

  return {
    total: result.total ?? quotes.length,
    results: quotes.map((q) => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      marketCap: q.marketCap ?? null,
      peRatio: q.trailingPE ?? null,
      // Response field is percent-scale (7.84 = 7.84%); normalize to
      // fraction-scale (0.0784) to match dividendYield everywhere else in
      // the app, so the frontend's existing fmtPercent() works unchanged.
      dividendYield: q.dividendYield != null ? q.dividendYield / 100 : null,
      volume: q.regularMarketVolume ?? null,
    })),
  };
}

module.exports = { runScreener, SECTORS };
