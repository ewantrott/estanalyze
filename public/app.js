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
const watchlistToggle = document.getElementById("watchlist-toggle");

let currentQuote = null;

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function runSearch(rawTicker) {
  const ticker = rawTicker.toUpperCase();
  results.classList.add("hidden");
  setStatus(`Loading ${ticker}...`);
  analysisContent.textContent = "";
  newsList.innerHTML = "";
  statsGrid.innerHTML = "";
  currentQuote = null;

  let quote;
  try {
    const quoteRes = await fetch(`/api/quote/${encodeURIComponent(ticker)}`);
    quote = await quoteRes.json();
    if (!quoteRes.ok) throw new Error(quote.error || "Failed to load quote");
  } catch (err) {
    setStatus(`Couldn't load ${ticker}: ${err.message}`, true);
    return;
  }

  currentQuote = quote;
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
    const arrow = diff >= 0 ? "▲" : "▼";
    quoteChange.textContent = `${arrow} ${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
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

  updateWatchlistToggle();
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

// ---------- Tabs ----------

const tabButtons = document.querySelectorAll(".tab");
const tabPanels = {
  analyze: document.getElementById("tab-analyze"),
  market: document.getElementById("tab-market"),
  watchlist: document.getElementById("tab-watchlist"),
};

function activateTab(name) {
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  Object.entries(tabPanels).forEach(([panelName, panel]) => {
    panel.classList.toggle("hidden", panelName !== name);
  });
  if (name === "market") loadMarketOverview();
  if (name === "watchlist") loadWatchlist();
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// Clicking any ticker card (watchlist, market overview, top movers) jumps
// to the Analyze tab and looks it up, like clicking a quick-pick chip.
function goToTicker(symbol) {
  input.value = symbol;
  activateTab("analyze");
  runSearch(symbol);
}

function bindMoverGridClicks(container) {
  container.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".mover-remove");
    if (removeBtn) {
      removeFromWatchlist(removeBtn.dataset.remove);
      if (currentQuote && currentQuote.symbol === removeBtn.dataset.remove) updateWatchlistToggle();
      loadWatchlist(true);
      return;
    }
    const card = e.target.closest(".mover-card");
    if (!card || card.classList.contains("error")) return;
    const symbol = card.dataset.symbol;
    if (symbol) goToTicker(symbol);
  });
}

// ---------- Shared mover-card rendering (indexes, sectors, watchlist) ----------

function moverCardHtml(item, { removable, index = 0 } = {}) {
  const delay = `style="animation-delay:${Math.min(index * 30, 300)}ms"`;

  if (item.error) {
    return `<div class="mover-card error" ${delay}>${escapeHtml(item.label || item.symbol)}<br />unavailable</div>`;
  }

  const change = item.change;
  const pct = item.changePercent;
  const hasChange = change != null && pct != null;
  const sign = hasChange && change >= 0 ? "+" : "";
  const dir = hasChange ? (change >= 0 ? "up" : "down") : "";
  const arrow = hasChange ? (change >= 0 ? "▲" : "▼") : "";

  const removeBtn = removable
    ? `<button type="button" class="mover-remove" data-remove="${escapeHtml(item.symbol)}" title="Remove">&times;</button>`
    : "";

  return `<div class="mover-card" data-symbol="${escapeHtml(item.symbol)}" ${delay}>
    ${removeBtn}
    <div class="mover-symbol">${escapeHtml(item.symbol)}</div>
    <div class="mover-name">${escapeHtml(item.label || item.name || "")}</div>
    <div class="mover-price">${item.price != null ? round2(item.price) : "n/a"}</div>
    <div class="mover-change ${dir}">${hasChange ? `${arrow} ${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)` : ""}</div>
  </div>`;
}

// ---------- Market Overview ----------

const indexGrid = document.getElementById("index-grid");
const sectorGrid = document.getElementById("sector-grid");
let marketOverviewLoaded = false;

bindMoverGridClicks(indexGrid);
bindMoverGridClicks(sectorGrid);

async function loadMarketOverview() {
  if (marketOverviewLoaded) return;
  indexGrid.innerHTML = "<div class=\"panel-note loading\">Loading...</div>";
  sectorGrid.innerHTML = "<div class=\"panel-note loading\">Loading...</div>";
  try {
    const res = await fetch("/api/market-overview");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load market overview");
    indexGrid.innerHTML = data.indexes.map((item, i) => moverCardHtml(item, { index: i })).join("");
    sectorGrid.innerHTML = data.sectors.map((item, i) => moverCardHtml(item, { index: i })).join("");
    marketOverviewLoaded = true;
  } catch (err) {
    indexGrid.innerHTML = `<div class="panel-note">Couldn't load: ${escapeHtml(err.message)}</div>`;
    sectorGrid.innerHTML = "";
  }
}

// ---------- Top Movers (homepage) ----------

const gainersList = document.getElementById("gainers-list");
const losersList = document.getElementById("losers-list");

bindMoverGridClicks(gainersList);
bindMoverGridClicks(losersList);

async function loadTopMovers() {
  gainersList.innerHTML = "<div class=\"panel-note loading\">Loading...</div>";
  losersList.innerHTML = "<div class=\"panel-note loading\">Loading...</div>";
  try {
    const res = await fetch("/api/top-movers");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load top movers");
    gainersList.innerHTML = (data.gainers || []).map((item, i) => moverCardHtml(item, { index: i })).join("") ||
      "<div class=\"panel-note\">No data available.</div>";
    losersList.innerHTML = (data.losers || []).map((item, i) => moverCardHtml(item, { index: i })).join("") ||
      "<div class=\"panel-note\">No data available.</div>";
  } catch (err) {
    gainersList.innerHTML = `<div class="panel-note">Couldn't load: ${escapeHtml(err.message)}</div>`;
    losersList.innerHTML = "";
  }
}

loadTopMovers();

// ---------- Watchlist ----------

const WATCHLIST_KEY = "estanalyze_watchlist";
const watchlistForm = document.getElementById("watchlist-form");
const watchlistInput = document.getElementById("watchlist-input");
const watchlistStatusEl = document.getElementById("watchlist-status");
const watchlistGrid = document.getElementById("watchlist-grid");
const watchlistEmpty = document.getElementById("watchlist-empty");

bindMoverGridClicks(watchlistGrid);

function getWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(symbols) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols));
}

function isWatchlisted(symbol) {
  return getWatchlist().includes(symbol);
}

function addToWatchlist(symbol) {
  const list = getWatchlist();
  if (!list.includes(symbol)) {
    list.push(symbol);
    saveWatchlist(list);
  }
}

function removeFromWatchlist(symbol) {
  saveWatchlist(getWatchlist().filter((s) => s !== symbol));
}

function updateWatchlistToggle() {
  if (!currentQuote) return;
  const watchlisted = isWatchlisted(currentQuote.symbol);
  watchlistToggle.textContent = watchlisted ? "✓ Watchlisted" : "+ Watchlist";
  watchlistToggle.classList.toggle("active", watchlisted);
}

watchlistToggle.addEventListener("click", () => {
  if (!currentQuote) return;
  if (isWatchlisted(currentQuote.symbol)) {
    removeFromWatchlist(currentQuote.symbol);
  } else {
    addToWatchlist(currentQuote.symbol);
  }
  updateWatchlistToggle();
  marketWatchlistDirty = true;
});

watchlistForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const symbol = watchlistInput.value.trim().toUpperCase();
  if (!symbol) return;
  addToWatchlist(symbol);
  watchlistInput.value = "";
  if (currentQuote && currentQuote.symbol === symbol) updateWatchlistToggle();
  loadWatchlist(true);
});

let marketWatchlistDirty = false;

async function loadWatchlist(force = false) {
  const symbols = getWatchlist();

  if (!symbols.length) {
    watchlistEmpty.classList.remove("hidden");
    watchlistGrid.innerHTML = "";
    return;
  }
  watchlistEmpty.classList.add("hidden");

  if (!force && !marketWatchlistDirty && watchlistGrid.dataset.loadedFor === symbols.join(",")) return;

  watchlistGrid.innerHTML = "<div class=\"panel-note loading\">Loading...</div>";
  watchlistStatusEl.textContent = "";
  try {
    const res = await fetch(`/api/watchlist-quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load watchlist");
    watchlistGrid.innerHTML = data.quotes
      .map((item, i) => moverCardHtml(item, { removable: true, index: i }))
      .join("");
    watchlistGrid.dataset.loadedFor = symbols.join(",");
    marketWatchlistDirty = false;
  } catch (err) {
    watchlistStatusEl.textContent = `Couldn't load watchlist: ${err.message}`;
    watchlistStatusEl.classList.add("error");
    watchlistGrid.innerHTML = "";
  }
}
