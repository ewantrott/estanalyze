const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};

const chartUrl = (ticker, range = "6mo", interval = "1d") =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${encodeURIComponent(
    interval
  )}&range=${encodeURIComponent(range)}`;

const quoteSummaryUrl = (ticker, crumb) =>
  `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    ticker
  )}?modules=price,summaryDetail,defaultKeyStatistics,financialData,assetProfile&crumb=${encodeURIComponent(crumb)}`;

async function fetchChart(ticker, range = "6mo", interval = "1d") {
  const res = await fetch(chartUrl(ticker, range, interval), { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo Finance request failed (${res.status})`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) {
    const message = data?.chart?.error?.description || "No data found for this ticker";
    throw new Error(message);
  }
  return result;
}

// Yahoo's quoteSummary endpoint requires a session cookie + crumb token.
// Fetch and cache them for the life of the process; refresh once on failure
// in case they expire.
let sessionCache = null; // { cookie, crumb }

async function fetchSession() {
  const cookieRes = await fetch("https://fc.yahoo.com", { headers: HEADERS, redirect: "manual" });
  const setCookie = cookieRes.headers.get("set-cookie");
  if (!setCookie) throw new Error("Could not obtain Yahoo session cookie");
  const cookie = setCookie.split(";")[0];

  // The getcrumb endpoint 406s if an Accept: application/json header is sent.
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": HEADERS["User-Agent"], Cookie: cookie },
  });
  if (!crumbRes.ok) throw new Error("Could not obtain Yahoo crumb token");
  const crumb = (await crumbRes.text()).trim();
  if (!crumb) throw new Error("Empty Yahoo crumb token");

  return { cookie, crumb };
}

async function getSession() {
  if (!sessionCache) sessionCache = await fetchSession();
  return sessionCache;
}

// Extended fundamentals are best-effort: if Yahoo's session/crumb dance
// fails or the endpoint changes shape, fall back to "unavailable" rather
// than a hard error, since the chart endpoint alone still gives a usable quote.
async function fetchQuoteSummary(ticker) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const session = await getSession();
      const res = await fetch(quoteSummaryUrl(ticker, session.crumb), {
        headers: { ...HEADERS, Cookie: session.cookie },
      });
      if (res.status === 401) {
        sessionCache = null; // crumb likely expired, retry once with a fresh session
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      return data?.quoteSummary?.result?.[0] || null;
    } catch {
      sessionCache = null;
      return null;
    }
  }
  return null;
}

// Yahoo wraps most numeric fields as { raw, fmt }. Always prefer the raw
// number — the frontend formats for display, and formatted strings (e.g.
// "7,411.98") break numeric math like the daily price-change calculation.
const pick = (field) => (field && (field.raw ?? field.fmt)) ?? null;

// meta.chartPreviousClose is misleadingly named: for range=6mo it's the
// close from ~6 months ago (start of the series), not yesterday's close.
// Derive the real previous close from the last two non-null daily closes.
function derivePreviousClose(chart) {
  const closes = chart?.indicators?.quote?.[0]?.close || [];
  const nonNull = closes.filter((c) => c != null);
  if (nonNull.length < 2) return null;
  return nonNull[nonNull.length - 2];
}

function buildQuote(ticker, chart, summary) {
  const meta = chart.meta || {};
  const price = summary?.price || {};
  const detail = summary?.summaryDetail || {};
  const stats = summary?.defaultKeyStatistics || {};
  const financials = summary?.financialData || {};
  const profile = summary?.assetProfile || {};

  return {
    symbol: ticker,
    name: price.longName || price.shortName || meta.longName || meta.shortName || meta.symbol || ticker,
    exchange: meta.fullExchangeName || meta.exchangeName || null,
    currency: meta.currency || price.currency || null,
    instrumentType: meta.instrumentType || null,
    price: meta.regularMarketPrice ?? pick(price.regularMarketPrice),
    previousClose: pick(price.regularMarketPreviousClose) ?? derivePreviousClose(chart) ?? meta.chartPreviousClose,
    dayHigh: meta.regularMarketDayHigh ?? pick(detail.dayHigh),
    dayLow: meta.regularMarketDayLow ?? pick(detail.dayLow),
    fiftyTwoWeekHigh: pick(detail.fiftyTwoWeekHigh) ?? meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: pick(detail.fiftyTwoWeekLow) ?? meta.fiftyTwoWeekLow ?? null,
    volume: meta.regularMarketVolume ?? pick(detail.volume),
    averageVolume: pick(detail.averageVolume),
    marketCap: pick(price.marketCap),
    trailingPE: pick(detail.trailingPE),
    forwardPE: pick(detail.forwardPE),
    trailingEps: pick(stats.trailingEps),
    forwardEps: pick(stats.forwardEps),
    dividendYield: pick(detail.dividendYield),
    beta: pick(detail.beta),
    profitMargins: pick(stats.profitMargins),
    totalRevenue: pick(financials.totalRevenue),
    revenueGrowth: pick(financials.revenueGrowth),
    grossMargins: pick(financials.grossMargins),
    operatingMargins: pick(financials.operatingMargins),
    returnOnEquity: pick(financials.returnOnEquity),
    sector: profile.sector || null,
    industry: profile.industry || null,
    businessSummary: profile.longBusinessSummary || null,
    extendedStatsAvailable: Boolean(summary),
  };
}

// Lightweight quote (price + change only) for lists of many symbols
// (market overview, watchlist) where fetching full fundamentals for every
// symbol would be slow and unnecessary. Still uses quoteSummary's
// authoritative previousClose when available (cheap after the first call,
// since the session/crumb is cached) so the change % matches the main
// Analyze tab instead of falling back to the less precise derived value.
function buildLiteQuote(ticker, chart, summary) {
  const meta = chart.meta || {};
  const price = summary?.price || {};
  const previousClose =
    pick(price.regularMarketPreviousClose) ?? derivePreviousClose(chart) ?? meta.chartPreviousClose ?? null;
  const currentPrice = meta.regularMarketPrice ?? pick(price.regularMarketPrice) ?? null;
  const change = currentPrice != null && previousClose != null ? currentPrice - previousClose : null;
  const changePercent = change != null && previousClose ? (change / previousClose) * 100 : null;

  return {
    symbol: ticker,
    name: price.longName || price.shortName || meta.longName || meta.shortName || meta.symbol || ticker,
    price: currentPrice,
    previousClose,
    change,
    changePercent,
    currency: meta.currency || null,
  };
}

async function fetchLiteQuote(ticker) {
  const [chart, summary] = await Promise.all([fetchChart(ticker, "5d"), fetchQuoteSummary(ticker)]);
  return buildLiteQuote(ticker, chart, summary);
}

module.exports = { fetchChart, fetchQuoteSummary, buildQuote, fetchLiteQuote };
