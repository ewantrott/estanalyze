const { fetchLiteQuote } = require("./yahoo");

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

module.exports = { fetchMarketOverview };
