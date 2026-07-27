const sharp = require("sharp");

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

// Uses generic browser-safe font names (not the site's Inter webfont) since
// this renders server-side via librsvg, which only has access to whatever
// system fonts exist in the deploy environment, not Google Fonts.
function buildSvg({ symbol, name, price, change, changePercent, currency }) {
  const hasChange = change != null && changePercent != null;
  const up = !hasChange || change >= 0;
  const accent1 = up ? "#3ecf8e" : "#ff6b6b";
  const accent2 = up ? "#2fae76" : "#e0393f";
  const sign = hasChange && change >= 0 ? "+" : "";
  const arrow = hasChange ? (up ? "▲" : "▼") : "";
  const priceText = price != null ? `${Number(price).toFixed(2)} ${currency || ""}`.trim() : "n/a";
  const changeText = hasChange
    ? `${arrow} ${sign}${Number(change).toFixed(2)} (${sign}${Number(changePercent).toFixed(2)}%)`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0b0d12"/>
        <stop offset="100%" stop-color="#151822"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${accent1}"/>
        <stop offset="100%" stop-color="${accent2}"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <g stroke="#232838" stroke-width="1">
      <line x1="0" y1="150" x2="1200" y2="150"/>
      <line x1="0" y1="300" x2="1200" y2="300"/>
      <line x1="0" y1="450" x2="1200" y2="450"/>
    </g>
    <text x="96" y="130" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#9aa2b1" letter-spacing="3">ESTANALYZE</text>
    <text x="94" y="290" font-family="Arial, Helvetica, sans-serif" font-size="108" font-weight="700" fill="#e8eaf0">${escapeXml(symbol)}</text>
    <text x="98" y="335" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#9aa2b1">${escapeXml(name)}</text>
    <text x="98" y="425" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" fill="#e8eaf0">${escapeXml(priceText)}</text>
    <text x="98" y="472" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="${accent1}">${escapeXml(changeText)}</text>
  </svg>`;
}

async function renderTickerOgImage(data) {
  const svg = buildSvg(data);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { renderTickerOgImage };
