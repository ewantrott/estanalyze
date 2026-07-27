const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};

async function searchTickers(query, limit = 8) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query
  )}&quotesCount=${limit}&newsCount=0`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Search request failed (${res.status})`);
  const data = await res.json();
  const quotes = data?.quotes || [];

  return quotes
    .filter((q) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "INDEX"))
    .slice(0, limit)
    .map((q) => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      exchange: q.exchDisp || q.exchange || null,
      type: q.quoteType,
    }));
}

module.exports = { searchTickers };
