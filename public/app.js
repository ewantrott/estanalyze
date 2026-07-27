const form = document.getElementById("search-form");
const input = document.getElementById("ticker-input");
const statusEl = document.getElementById("status");
const results = document.getElementById("results");

const quoteTitle = document.getElementById("quote-title");
const quotePrice = document.getElementById("quote-price");
const quoteChange = document.getElementById("quote-change");
const statsGrid = document.getElementById("stats-grid");
const businessSummary = document.getElementById("business-summary");
const newsList = document.getElementById("news-list");
const analysisContent = document.getElementById("analysis-content");

document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    input.value = btn.dataset.ticker;
    runSearch(btn.dataset.ticker);
  });
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const ticker = input.value.trim();
  if (ticker) runSearch(ticker);
});

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function fmtNumber(value) {
  if (value === null || value === undefined || value === "") return "n/a";
  if (typeof value === "number") {
    if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(2) + "B";
    if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(2) + "M";
    if (Math.abs(value) >= 1e3) return value.toLocaleString();
    return String(value);
  }
  return String(value);
}

function round2(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(num) ? value : Math.round(num * 100) / 100;
}

function fmtPercent(value) {
  if (value === null || value === undefined) return "n/a";
  const num = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(num)) return String(value);
  return (num * 100).toFixed(2) + "%";
}

async function runSearch(rawTicker) {
  const ticker = rawTicker.toUpperCase();
  results.classList.add("hidden");
  setStatus(`Loading ${ticker}...`);
  analysisContent.textContent = "";
  newsList.innerHTML = "";
  statsGrid.innerHTML = "";

  let quote;
  try {
    const quoteRes = await fetch(`/api/quote/${encodeURIComponent(ticker)}`);
    quote = await quoteRes.json();
    if (!quoteRes.ok) throw new Error(quote.error || "Failed to load quote");
  } catch (err) {
    setStatus(`Couldn't load ${ticker}: ${err.message}`, true);
    return;
  }

  renderQuote(quote);
  results.classList.remove("hidden");
  setStatus("");

  let news = [];
  try {
    const newsRes = await fetch(`/api/news/${encodeURIComponent(ticker)}?q=${encodeURIComponent(quote.name || ticker)}`);
    const newsData = await newsRes.json();
    if (newsRes.ok) news = newsData.news || [];
  } catch {
    // non-fatal
  }
  renderNews(news);

  analysisContent.textContent = "Generating analysis...";
  analysisContent.classList.add("muted");
  try {
    const analyzeRes = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, quote, news }),
    });
    const analysis = await analyzeRes.json();
    if (analysis.available) {
      analysisContent.textContent = analysis.summary;
      analysisContent.classList.remove("muted");
    } else {
      analysisContent.textContent = analysis.message || "AI summary unavailable.";
      analysisContent.classList.add("muted");
    }
  } catch (err) {
    analysisContent.textContent = `AI summary failed: ${err.message}`;
    analysisContent.classList.add("muted");
  }
}

function renderQuote(quote) {
  quoteTitle.textContent = `${quote.name} (${quote.symbol})`;
  quotePrice.textContent = quote.price != null ? `${round2(quote.price)} ${quote.currency || ""}`.trim() : "n/a";

  if (quote.price != null && quote.previousClose != null) {
    const diff = quote.price - quote.previousClose;
    const pct = (diff / quote.previousClose) * 100;
    const sign = diff >= 0 ? "+" : "";
    quoteChange.textContent = `${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
    quoteChange.className = "change " + (diff >= 0 ? "up" : "down");
  } else {
    quoteChange.textContent = "";
    quoteChange.className = "change";
  }

  const stats = [
    ["Exchange", quote.exchange],
    ["Previous Close", round2(quote.previousClose) ?? "n/a"],
    [
      "Day Range",
      quote.dayLow != null && quote.dayHigh != null ? `${round2(quote.dayLow)} - ${round2(quote.dayHigh)}` : "n/a",
    ],
    [
      "52-Week Range",
      quote.fiftyTwoWeekLow != null ? `${round2(quote.fiftyTwoWeekLow)} - ${round2(quote.fiftyTwoWeekHigh)}` : "n/a",
    ],
    ["Volume", fmtNumber(quote.volume)],
    ["Market Cap", fmtNumber(quote.marketCap)],
    ["Trailing P/E", quote.trailingPE != null ? round2(quote.trailingPE) : "n/a"],
    ["Forward P/E", quote.forwardPE != null ? round2(quote.forwardPE) : "n/a"],
    ["Dividend Yield", quote.dividendYield != null ? fmtPercent(quote.dividendYield) : "n/a"],
    ["Revenue Growth", quote.revenueGrowth != null ? fmtPercent(quote.revenueGrowth) : "n/a"],
    ["Profit Margin", quote.profitMargins != null ? fmtPercent(quote.profitMargins) : "n/a"],
    ["Sector / Industry", quote.sector ? `${quote.sector} / ${quote.industry || "n/a"}` : "n/a"],
  ];

  statsGrid.innerHTML = stats
    .map(
      ([label, value]) =>
        `<div><div class="stat-label">${label}</div><div class="stat-value">${value ?? "n/a"}</div></div>`
    )
    .join("");

  businessSummary.textContent = quote.businessSummary || "";
  if (!quote.extendedStatsAvailable) {
    setStatus("Note: extended fundamentals were unavailable for this symbol; showing price data only.");
  }
}

function renderNews(news) {
  if (!news.length) {
    newsList.innerHTML = "<li>No recent news found.</li>";
    return;
  }
  newsList.innerHTML = news
    .map((item) => {
      const date = item.pubDate ? new Date(item.pubDate).toLocaleString() : "";
      return `<li>
        <a href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
        <div class="news-meta">${escapeHtml(item.source || "")}${date ? " · " + date : ""}</div>
      </li>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
