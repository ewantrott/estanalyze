const { XMLParser } = require("fast-xml-parser");

async function fetchNews(query, limit = 12) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`News request failed (${res.status})`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const rawItems = data?.rss?.channel?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items.slice(0, limit).map((item) => ({
    title: typeof item.title === "string" ? item.title : String(item.title ?? ""),
    link: item.link || null,
    pubDate: item.pubDate || null,
    source: item.source?.["#text"] || (typeof item.source === "string" ? item.source : null),
  }));
}

module.exports = { fetchNews };
