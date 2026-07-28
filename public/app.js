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
const moversCard = document.getElementById("movers-card");
const earningsContent = document.getElementById("earnings-content");

let currentQuote = null;

// ---------- Theme toggle ----------

const THEME_KEY = "estanalyze_theme";
const themeToggle = document.getElementById("theme-toggle");

function effectiveTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function updateThemeColorMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f5f7fa" : "#0b0d12");
}

updateThemeColorMeta(effectiveTheme());

themeToggle.addEventListener("click", () => {
  const next = effectiveTheme() === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  document.documentElement.setAttribute("data-theme", next);
  updateThemeColorMeta(next);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  hideSuggestions();
  const ticker = input.value.trim();
  if (ticker) runSearch(ticker);
});

// ---------- Ticker autocomplete ----------

const suggestionsBox = document.getElementById("search-suggestions");
let suggestionItems = [];
let activeSuggestionIndex = -1;
let searchDebounce = null;
let searchRequestId = 0;

function hideSuggestions() {
  suggestionsBox.classList.add("hidden");
  suggestionsBox.innerHTML = "";
  suggestionItems = [];
  activeSuggestionIndex = -1;
}

function renderSuggestions(items) {
  suggestionItems = items;
  activeSuggestionIndex = -1;
  if (!items.length) {
    hideSuggestions();
    return;
  }
  suggestionsBox.innerHTML = items
    .map(
      (item, i) => `<div class="suggestion-item" data-index="${i}">
        <span class="suggestion-symbol">${escapeHtml(item.symbol)}</span>
        <span class="suggestion-name">${escapeHtml(item.name)}</span>
        <span class="suggestion-exchange">${escapeHtml(item.exchange || "")}</span>
      </div>`
    )
    .join("");
  suggestionsBox.classList.remove("hidden");

  suggestionsBox.querySelectorAll(".suggestion-item").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep focus/avoid input blur before click registers
      selectSuggestion(Number(el.dataset.index));
    });
  });
}

function selectSuggestion(i) {
  const item = suggestionItems[i];
  if (!item) return;
  input.value = item.symbol;
  hideSuggestions();
  runSearch(item.symbol);
}

function highlightSuggestion(index) {
  activeSuggestionIndex = index;
  suggestionsBox.querySelectorAll(".suggestion-item").forEach((el, i) => {
    el.classList.toggle("active", i === index);
    if (i === index) el.scrollIntoView({ block: "nearest" });
  });
}

input.addEventListener("input", () => {
  const query = input.value.trim();
  clearTimeout(searchDebounce);
  if (query.length < 1) {
    hideSuggestions();
    return;
  }
  searchDebounce = setTimeout(async () => {
    const thisRequest = ++searchRequestId;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (thisRequest !== searchRequestId) return; // stale response, a newer query superseded it
      renderSuggestions(data.results || []);
    } catch {
      if (thisRequest === searchRequestId) hideSuggestions();
    }
  }, 250);
});

input.addEventListener("keydown", (e) => {
  if (suggestionsBox.classList.contains("hidden")) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlightSuggestion(Math.min(activeSuggestionIndex + 1, suggestionItems.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlightSuggestion(Math.max(activeSuggestionIndex - 1, 0));
  } else if (e.key === "Enter") {
    if (activeSuggestionIndex >= 0) {
      e.preventDefault();
      selectSuggestion(activeSuggestionIndex);
    } else {
      hideSuggestions();
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-input-wrap")) hideSuggestions();
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

// Makes the current search shareable: after looking up a ticker, the URL
// reflects it (e.g. /AAPL) so copying the address bar link works, and that
// link gets a per-ticker Discord embed via the server's og:image route.
function updateUrlForTicker(ticker) {
  const targetPath = "/" + encodeURIComponent(ticker);
  if (window.location.pathname !== targetPath) {
    history.pushState({ ticker }, "", targetPath);
  }
}

async function runSearch(rawTicker) {
  const ticker = rawTicker.toUpperCase();
  results.classList.add("hidden");
  moversCard.classList.add("hidden");
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
  renderEarnings(quote);
  results.classList.remove("hidden");
  setStatus("");
  updateUrlForTicker(ticker);
  document.title = `${ticker} — ${quote.name} | ESTAnalyze`;

  resetChartRangeButtons();
  loadPriceChart(ticker, "1mo");

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

function renderEarnings(quote) {
  const summaryItems = [
    ["Next Earnings Date", quote.nextEarningsDate ? quote.nextEarningsDate + (quote.isEarningsDateEstimate ? " (est.)" : "") : "n/a"],
    ["EPS Estimate", quote.epsEstimateAverage != null ? round2(quote.epsEstimateAverage) : "n/a"],
    ["Revenue Estimate", quote.revenueEstimateAverage != null ? fmtNumber(quote.revenueEstimateAverage) : "n/a"],
    ["Ex-Dividend Date", quote.exDividendDate || "n/a"],
  ];

  const summaryHtml = `<div class="earnings-summary">${summaryItems
    .map(([label, value]) => `<div><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`)
    .join("")}</div>`;

  const history = quote.earningsHistory || [];
  if (!history.length) {
    earningsContent.innerHTML = summaryHtml + '<p class="panel-note">No recent quarterly earnings history available.</p>';
    return;
  }

  const rows = history
    .map((q) => {
      const beat = q.surprisePercent != null && q.surprisePercent >= 0;
      const dir = q.surprisePercent != null ? (beat ? "up" : "down") : "";
      const sign = q.surprisePercent != null && q.surprisePercent >= 0 ? "+" : "";
      return `<tr>
        <td>${escapeHtml(q.quarter || "n/a")}</td>
        <td>${q.epsActual != null ? round2(q.epsActual) : "n/a"}</td>
        <td>${q.epsEstimate != null ? round2(q.epsEstimate) : "n/a"}</td>
        <td class="earnings-surprise ${dir}">${q.surprisePercent != null ? `${sign}${q.surprisePercent.toFixed(2)}%` : "n/a"}</td>
        <td>${escapeHtml(q.reportedDate || "n/a")}</td>
      </tr>`;
    })
    .join("");

  earningsContent.innerHTML = `${summaryHtml}
    <div class="table-scroll">
      <table class="earnings-history-table">
        <thead>
          <tr><th>Quarter</th><th>EPS Actual</th><th>EPS Estimate</th><th>Surprise</th><th>Reported</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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

// ---------- Price Chart ----------

const chartContainer = document.getElementById("chart-container");
const chartRangeFilter = document.getElementById("chart-range-filter");
let currentChartTicker = null;

function resetChartRangeButtons() {
  chartRangeFilter.querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.range === "1mo"));
}

chartRangeFilter.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!currentChartTicker || btn.classList.contains("active")) return;
    chartRangeFilter.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loadPriceChart(currentChartTicker, btn.dataset.range);
  });
});

function fmtChartDate(unixSeconds, range) {
  const d = new Date(unixSeconds * 1000);
  if (range === "1d" || range === "1w") {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderPriceChart(points, range) {
  if (!points || points.length < 2) {
    chartContainer.innerHTML = '<p class="panel-note">No chart data available for this range.</p>';
    return;
  }

  const w = 700;
  const h = 220;
  const padX = 4;
  const padY = 10;
  const closes = points.map((p) => p.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const spread = max - min || 1;
  const up = closes[closes.length - 1] >= closes[0];
  const dir = up ? "up" : "down";
  const step = (w - padX * 2) / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = padX + i * step;
    const y = padY + (h - padY * 2) * (1 - (p.c - min) / spread);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const areaPath = `M${coords[0]} L${coords.join(" L")} L${(w - padX).toFixed(1)},${(h - padY).toFixed(1)} L${padX.toFixed(1)},${(h - padY).toFixed(1)} Z`;

  chartContainer.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="price-chart-svg ${dir}">
      <defs>
        <linearGradient id="chart-fill-${dir}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-opacity="0.28" />
          <stop offset="100%" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#chart-fill-${dir})" stroke="none" />
      <polyline points="${coords.join(" ")}" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <div class="chart-range-labels">
      <span>${escapeHtml(fmtChartDate(points[0].t, range))}</span>
      <span>${escapeHtml(fmtChartDate(points[points.length - 1].t, range))}</span>
    </div>
  `;
}

async function loadPriceChart(ticker, range) {
  currentChartTicker = ticker;
  chartContainer.innerHTML = '<p class="panel-note loading">Loading chart...</p>';
  try {
    const res = await fetch(`/api/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load chart");
    if (currentChartTicker !== ticker) return; // a newer search superseded this request
    renderPriceChart(data.points, range);
  } catch (err) {
    if (currentChartTicker !== ticker) return;
    chartContainer.innerHTML = `<p class="panel-note">Couldn't load chart: ${escapeHtml(err.message)}</p>`;
  }
}

// ---------- Tabs ----------

const tabButtons = document.querySelectorAll(".tab");
const tabPanels = {
  analyze: document.getElementById("tab-analyze"),
  market: document.getElementById("tab-market"),
  screener: document.getElementById("tab-screener"),
  watchlist: document.getElementById("tab-watchlist"),
};

function activateTab(name) {
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  Object.entries(tabPanels).forEach(([panelName, panel]) => {
    panel.classList.toggle("hidden", panelName !== name);
  });
  if (name === "market") loadMarketOverview();
  if (name === "watchlist") loadWatchlist();
  if (name === "screener") loadScreenerSectors();
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

function sparklineSvg(points, dir) {
  if (!Array.isArray(points) || points.length < 2) return "";
  const w = 100;
  const h = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const strokeClass = dir === "down" ? "spark-down" : "spark-up";
  return `<svg class="sparkline ${strokeClass}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${coords}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

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
    ${sparklineSvg(item.sparkline, dir)}
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

// ---------- Screener ----------

const screenerForm = document.getElementById("screener-form");
const screenerSector = document.getElementById("screener-sector");
const screenerStatus = document.getElementById("screener-status");
const screenerTable = document.getElementById("screener-table");
const screenerResults = document.getElementById("screener-results");
let screenerSectorsLoaded = false;

async function loadScreenerSectors() {
  if (screenerSectorsLoaded) return;
  try {
    const res = await fetch("/api/screener/sectors");
    const data = await res.json();
    (data.sectors || []).forEach((sector) => {
      const opt = document.createElement("option");
      opt.value = sector;
      opt.textContent = sector;
      screenerSector.appendChild(opt);
    });
    screenerSectorsLoaded = true;
  } catch {
    // non-fatal; "All sectors" option still works
  }
}

function screenerRowHtml(item) {
  const hasChange = item.change != null && item.changePercent != null;
  const dir = hasChange ? (item.change >= 0 ? "up" : "down") : "";
  const sign = hasChange && item.change >= 0 ? "+" : "";
  const changeText = hasChange ? `${sign}${item.change.toFixed(2)} (${sign}${item.changePercent.toFixed(2)}%)` : "n/a";

  return `<tr data-symbol="${escapeHtml(item.symbol)}">
    <td class="sym-cell">${escapeHtml(item.symbol)}</td>
    <td class="name-cell">${escapeHtml(item.name)}</td>
    <td>${item.price != null ? round2(item.price) : "n/a"}</td>
    <td class="change-cell ${dir}">${changeText}</td>
    <td>${fmtNumber(item.marketCap)}</td>
    <td>${item.peRatio != null ? round2(item.peRatio) : "n/a"}</td>
    <td>${item.dividendYield != null ? fmtPercent(item.dividendYield) : "n/a"}</td>
    <td>${fmtNumber(item.volume)}</td>
  </tr>`;
}

screenerTable.addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-symbol]");
  if (row) goToTicker(row.dataset.symbol);
});

screenerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const capMinB = document.getElementById("screener-cap-min").value;
  const capMaxB = document.getElementById("screener-cap-max").value;
  const priceMin = document.getElementById("screener-price-min").value;
  const priceMax = document.getElementById("screener-price-max").value;
  const peMin = document.getElementById("screener-pe-min").value;
  const peMax = document.getElementById("screener-pe-max").value;
  const divMin = document.getElementById("screener-div-min").value;
  const volMinM = document.getElementById("screener-vol-min").value;

  const params = new URLSearchParams();
  if (screenerSector.value) params.set("sector", screenerSector.value);
  if (capMinB) params.set("marketCapMin", String(Number(capMinB) * 1e9));
  if (capMaxB) params.set("marketCapMax", String(Number(capMaxB) * 1e9));
  if (priceMin) params.set("priceMin", priceMin);
  if (priceMax) params.set("priceMax", priceMax);
  if (peMin) params.set("peMin", peMin);
  if (peMax) params.set("peMax", peMax);
  if (divMin) params.set("dividendYieldMin", divMin);
  if (volMinM) params.set("volumeMin", String(Number(volMinM) * 1e6));
  params.set("sortField", document.getElementById("screener-sort").value);
  params.set("sortDir", document.getElementById("screener-sort-dir").value);

  screenerStatus.textContent = "Running screener...";
  screenerStatus.classList.remove("error");
  screenerTable.classList.add("hidden");

  try {
    const res = await fetch(`/api/screener?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Screener failed");
    if (!data.results.length) {
      screenerStatus.textContent = "No matches. Try widening your filters.";
      screenerResults.innerHTML = "";
      return;
    }
    screenerResults.innerHTML = data.results.map(screenerRowHtml).join("");
    screenerTable.classList.remove("hidden");
    screenerStatus.textContent = `${data.total.toLocaleString()} match${data.total === 1 ? "" : "es"} — showing top ${data.results.length}.`;
  } catch (err) {
    screenerStatus.textContent = `Couldn't run screener: ${err.message}`;
    screenerStatus.classList.add("error");
    screenerResults.innerHTML = "";
  }
});

// ---------- Top Movers (homepage) ----------

const gainersList = document.getElementById("gainers-list");
const losersList = document.getElementById("losers-list");
const moversFilter = document.getElementById("movers-filter");
const moversNote = document.getElementById("movers-note");

const MOVERS_NOTES = {
  day: "Day-level gainers/losers across the market.",
  10: "Last 10 minutes, scanned across a curated set of large, liquid stocks (not the full market).",
  30: "Last 30 minutes, scanned across a curated set of large, liquid stocks (not the full market).",
  60: "Last hour, scanned across a curated set of large, liquid stocks (not the full market).",
};

bindMoverGridClicks(gainersList);
bindMoverGridClicks(losersList);

let currentMoversWindow = "day";

moversFilter.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.window === currentMoversWindow) return;
    moversFilter.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMoversWindow = btn.dataset.window;
    loadTopMovers(currentMoversWindow);
  });
});

async function loadTopMovers(windowParam = "day") {
  gainersList.innerHTML = "<div class=\"panel-note loading\">Loading...</div>";
  losersList.innerHTML = "<div class=\"panel-note loading\">Loading...</div>";
  moversNote.textContent = MOVERS_NOTES[windowParam] || "";
  try {
    const url = windowParam === "day" ? "/api/top-movers" : `/api/top-movers?window=${windowParam}`;
    const res = await fetch(url);
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

// ---------- Deep links (/AAPL) ----------

window.addEventListener("popstate", (e) => {
  const ticker = e.state && e.state.ticker ? e.state.ticker : decodeURIComponent(window.location.pathname.slice(1) || "");
  if (ticker) {
    input.value = ticker;
    activateTab("analyze");
    runSearch(ticker);
  }
});

if (window.__INITIAL_TICKER__) {
  input.value = window.__INITIAL_TICKER__;
  activateTab("analyze");
  runSearch(window.__INITIAL_TICKER__);
}
