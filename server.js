// server.js - Day 21: Sparkline Charts + Keyboard Shortcuts + v2.1
const express = require('express');
const axios = require('axios');
const fs = require('fs');
try { require('dotenv').config(); } catch(e) {}
const { loadAlerts } = require('./alerts');
const app = express();
app.use(express.json());

const API = 'https://api.elections.kalshi.com/trade-api/v2';
const PRICE_CACHE_FILE = './price-cache.json';
const PRICE_HISTORY_FILE = './price-history.json';
const MAX_HISTORY = 20;

function loadPriceCache() {
  try { return JSON.parse(fs.readFileSync(PRICE_CACHE_FILE, 'utf8')); }
  catch { return {}; }
}
function savePriceCache(markets, poly) {
  const cache = {};
  (markets || []).forEach(m => { cache['k:' + m.ticker] = m.yesPrice; });
  (poly || []).forEach(m => { cache['p:' + m.slug] = m.yesPrice; });
  fs.writeFileSync(PRICE_CACHE_FILE, JSON.stringify(cache));
}

function loadPriceHistory() {
  try { return JSON.parse(fs.readFileSync(PRICE_HISTORY_FILE, 'utf8')); }
  catch { return {}; }
}
function savePriceHistory(markets, poly) {
  const history = loadPriceHistory();
  const now = Date.now();
  (markets || []).forEach(m => {
    const key = 'k:' + m.ticker;
    if (!history[key]) history[key] = [];
    history[key].push({ t: now, p: m.yesPrice });
    if (history[key].length > MAX_HISTORY) history[key] = history[key].slice(-MAX_HISTORY);
  });
  (poly || []).forEach(m => {
    const key = 'p:' + m.slug;
    if (!history[key]) history[key] = [];
    history[key].push({ t: now, p: m.yesPrice });
    if (history[key].length > MAX_HISTORY) history[key] = history[key].slice(-MAX_HISTORY);
  });
  fs.writeFileSync(PRICE_HISTORY_FILE, JSON.stringify(history));
  return history;
}
function sparklineSvg(points) {
  if (!points || points.length < 2) return '';
  const prices = points.map(p => p.p);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 60, h = 20;
  const coords = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  const last = prices[prices.length - 1];
  const first = prices[0];
  const color = last >= first ? '#22c55e' : '#DC2626';
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="vertical-align:middle"><polyline points="' + coords + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

const WATCHLIST_FILE = './watchlist.json';
function loadWatchlist() {
  try { return JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8')); }
  catch { return []; }
}

// Kalshi Auth + Portfolio (API Key + RSA-PSS)
const crypto = require('crypto');
let kalshiApiKeyId = null;
let kalshiPrivateKey = null;

function initKalshiAuth() {
  const keyId = process.env.KALSHI_API_KEY_ID;
  const keyPath = process.env.KALSHI_PRIVATE_KEY_PATH;
  if (!keyId || !keyPath) return false;
  try {
    kalshiApiKeyId = keyId;
    kalshiPrivateKey = fs.readFileSync(keyPath, 'utf8');
    console.log('Kalshi auth: API key loaded (' + keyId.slice(0, 8) + '...)');
    return true;
  } catch (err) {
    console.error('Kalshi auth: Could not load private key:', err.message);
    return false;
  }
}

function kalshiHeaders(method, path) {
  if (!kalshiApiKeyId || !kalshiPrivateKey) return {};
  const timestamp = Date.now().toString();
  const pathWithoutQuery = path.split('?')[0];
  const message = timestamp + method + pathWithoutQuery;
  const signature = crypto.sign('sha256', Buffer.from(message), {
    key: kalshiPrivateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString('base64');
  return {
    'KALSHI-ACCESS-KEY': kalshiApiKeyId,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
  };
}

async function fetchPortfolio() {
  if (!kalshiApiKeyId) return null;
  try {
    const posPath = '/trade-api/v2/portfolio/positions';
    const balPath = '/trade-api/v2/portfolio/balance';
    const [posRes, balRes] = await Promise.all([
      axios.get(API + '/portfolio/positions', { headers: kalshiHeaders('GET', posPath) }),
      axios.get(API + '/portfolio/balance', { headers: kalshiHeaders('GET', balPath) }),
    ]);
    const positions = (posRes.data.market_positions || []).filter(p => p.position !== 0).map(p => ({
      ticker: p.ticker,
      market: p.ticker,
      position: p.position > 0 ? 'Yes' : 'No',
      qty: Math.abs(p.position),
      avgPrice: Math.round((p.total_traded / Math.max(Math.abs(p.position), 1))),
      currentPrice: p.market_exposure || 0,
      resting_orders_count: p.resting_orders_count || 0,
    }));
    const balance = balRes.data.balance || 0;
    return { positions, balance };
  } catch (err) {
    console.error('Portfolio fetch error:', err.response?.status, err.response?.data || err.message);
    return null;
  }
}

// Fallback mock portfolio
const MOCK_PORTFOLIO = [
  { market: 'BTC above $100k by Dec', position: 'Yes', qty: 15, avgPrice: 48, currentPrice: 52 },
  { market: 'Trump wins 2024', position: 'Yes', qty: 25, avgPrice: 55, currentPrice: 61 },
  { market: 'Fed cuts rates June', position: 'No', qty: 10, avgPrice: 52, currentPrice: 55 },
  { market: 'S&P 500 new ATH by March', position: 'Yes', qty: 20, avgPrice: 65, currentPrice: 70 },
  { market: 'TikTok banned in US', position: 'No', qty: 8, avgPrice: 60, currentPrice: 58 },
];

async function fetchKalshiMarkets() {
  try {
    const res = await axios.get(API + '/events', {
      params: { limit: 100, status: 'open', with_nested_markets: true }
    });
    const results = [];
    for (const event of res.data.events) {
      const mkts = event.markets || [];
      if (!mkts.length) continue;
      const best = mkts.sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
      if (!best || (best.volume || 0) === 0) continue;
      results.push({
        ticker: best.ticker,
        title: event.title || best.title,
        yesPrice: best.yes_bid || best.last_price || 0,
        noPrice: best.no_bid || 0,
        lastPrice: best.last_price || 0,
        volume: best.volume || 0,
        volume24h: best.volume_24h || 0,
      });
    }
    results.sort((a, b) => {
      const volA = (a.volume_24h || 0) * 10 + (a.volume || 0);
      const volB = (b.volume_24h || 0) * 10 + (b.volume || 0);
      return volB - volA;
    });
    return results.slice(0, 20);
  } catch (err) {
    console.error('Kalshi API error:', err.message);
    return null;
  }
}

async function fetchPolymarkets() {
  try {
    const res = await axios.get('https://gamma-api.polymarket.com/events', {
      params: { closed: false, limit: 50, order: 'volume24hr', ascending: false }
    });
    const results = [];
    for (const event of res.data) {
      const mkts = event.markets || [];
      if (!mkts.length) continue;
      const m = mkts[0];
      const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
      const yesPrice = prices[0] ? Math.round(parseFloat(prices[0]) * 100) : 0;
      if (yesPrice === 0) continue;
      results.push({
        slug: m.slug || event.slug || '',
        title: event.title || m.question || m.groupItemTitle || 'Untitled',
        yesPrice,
        volume: Math.round(parseFloat(m.volume24hr || m.volume || 0)),
        liquidity: Math.round(parseFloat(m.liquidityNum || 0)),
      });
    }
    return results.slice(0, 15);
  } catch (err) {
    console.error('Polymarket API error:', err.message);
    return null;
  }
}

// API: Create alert from browser
app.post('/api/alerts', (req, res) => {
  const fs = require('fs');
  const { marketName, condition, targetPrice } = req.body;
  if (!marketName || !condition || !targetPrice) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const alerts = loadAlerts();
  alerts.push({
    id: 'alert-' + Date.now(),
    marketId: 'web',
    marketName,
    condition,
    targetPrice: parseInt(targetPrice),
    triggered: false,
    createdAt: new Date().toISOString()
  });
  fs.writeFileSync('./alerts.json', JSON.stringify(alerts, null, 2));
  res.json({ ok: true });
});

// API: Delete alert
app.delete('/api/alerts/:id', (req, res) => {
  const alerts = loadAlerts().filter(a => a.id !== req.params.id);
  fs.writeFileSync('./alerts.json', JSON.stringify(alerts, null, 2));
  res.json({ ok: true });
});

// API: Add to watchlist
app.post('/api/watchlist', (req, res) => {
  const { id, title, source, link } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'Missing fields' });
  const wl = loadWatchlist();
  if (wl.find(w => w.id === id)) return res.json({ ok: true });
  wl.push({ id, title, source: source || 'unknown', link: link || '#', addedAt: new Date().toISOString() });
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(wl, null, 2));
  res.json({ ok: true });
});

// API: Remove from watchlist
app.delete('/api/watchlist/:id', (req, res) => {
  const wl = loadWatchlist().filter(w => w.id !== req.params.id);
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(wl, null, 2));
  res.json({ ok: true });
});

app.get('/', async (req, res) => {
  const alerts = loadAlerts();
  const watchlist = loadWatchlist();
  const [liveMarkets, polyMarkets] = await Promise.all([
    fetchKalshiMarkets(),
    fetchPolymarkets(),
  ]);
  const isLive = liveMarkets !== null;
  const isPoly = polyMarkets !== null;
  const markets = liveMarkets || [];
  const poly = polyMarkets || [];

  // Arbitrage detection
  function normalize(str) {
    return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function similarity(a, b) {
    const wordsA = normalize(a).split(' ');
    const wordsB = normalize(b).split(' ');
    const common = wordsA.filter(w => w.length > 2 && wordsB.includes(w));
    return common.length / Math.max(wordsA.length, wordsB.length);
  }
  const arbOpps = [];
  if (markets.length && poly.length) {
    for (const k of markets) {
      for (const p of poly) {
        const sim = similarity(k.title, p.title);
        if (sim >= 0.4) {
          const spread = Math.abs(k.yesPrice - p.yesPrice);
          if (spread >= 2) {
            arbOpps.push({
              kalshiTitle: k.title,
              polyTitle: p.title,
              kalshiPrice: k.yesPrice,
              polyPrice: p.yesPrice,
              spread,
              direction: k.yesPrice > p.yesPrice ? 'Buy Poly / Sell Kalshi' : 'Buy Kalshi / Sell Poly',
            });
          }
        }
      }
    }
    arbOpps.sort((a, b) => b.spread - a.spread);
  }

  // Price change tracking
  const prevPrices = loadPriceCache();
  markets.forEach(m => {
    const prev = prevPrices['k:' + m.ticker];
    m.delta = prev !== undefined ? m.yesPrice - prev : null;
  });
  poly.forEach(m => {
    const prev = prevPrices['p:' + m.slug];
    m.delta = prev !== undefined ? m.yesPrice - prev : null;
  });
  savePriceCache(markets, poly);
  const priceHistory = savePriceHistory(markets, poly);

  // Enrich watchlist with live prices
  const wlSet = new Set(watchlist.map(w => w.id));
  const enrichedWatchlist = watchlist.map(w => {
    const km = markets.find(m => m.ticker === w.id);
    const pm = poly.find(m => m.slug === w.id);
    const match = km || pm;
    return { ...w, yesPrice: match ? match.yesPrice : '?', delta: match ? match.delta : null };
  });

  // Top movers: combine both feeds, sort by absolute delta
  const allWithDelta = [
    ...markets.filter(m => m.delta !== null && m.delta !== 0).map(m => ({ title: m.title, yesPrice: m.yesPrice, delta: m.delta, source: 'kalshi', link: '/market/' + encodeURIComponent(m.ticker) })),
    ...poly.filter(m => m.delta !== null && m.delta !== 0).map(m => ({ title: m.title, yesPrice: m.yesPrice, delta: m.delta, source: 'poly', link: '/poly/' + encodeURIComponent(m.slug) })),
  ];
  const topMovers = allWithDelta.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);

  // Aggregate market stats
  const totalMarkets = markets.length + poly.length;
  const kalshiVol = markets.reduce((s, m) => s + (m.volume24h || 0), 0);
  const polyVol = poly.reduce((s, m) => s + (m.volume || 0), 0);
  const totalVol24h = kalshiVol + polyVol;
  const allPrices = [...markets.map(m => m.yesPrice), ...poly.map(m => m.yesPrice)];
  const avgPrice = allPrices.length ? Math.round(allPrices.reduce((s, p) => s + p, 0) / allPrices.length) : 0;

  // Portfolio: real if authenticated, mock if not
  const portfolio = await fetchPortfolio();
  const isRealPortfolio = portfolio !== null && portfolio.positions.length > 0;
  const rawPositions = isRealPortfolio ? portfolio.positions : MOCK_PORTFOLIO;
  const positions = rawPositions.map(p => {
    const pnl = (p.currentPrice - p.avgPrice) * p.qty;
    return { ...p, pnl };
  });
  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalValue = isRealPortfolio
    ? (portfolio.balance || 0)
    : positions.reduce((sum, p) => sum + (p.currentPrice * p.qty), 0);
  const winRate = positions.length ? Math.round((positions.filter(p => p.pnl > 0).length / positions.length) * 100) : 0;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daylight — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0a; --surface: #111111; --surface-2: #161616;
      --border: #1e1e1e; --border-2: #2a2a2a;
      --text: #e8e8e8; --text-2: #888; --text-3: #555;
      --red: #DC2626; --amber: #F59E0B; --gold: #FBBF24;
      --green: #22c55e; --purple: #6366f1;
      --green-dim: rgba(34,197,94,0.12); --red-dim: rgba(220,38,38,0.12);
      --amber-dim: rgba(245,158,11,0.1); --purple-dim: rgba(99,102,241,0.12);
      --nav-bg: rgba(10,10,10,0.95);
    }
    :root.light {
      --bg: #f5f5f5; --surface: #ffffff; --surface-2: #f0f0f0;
      --border: #e0e0e0; --border-2: #d0d0d0;
      --text: #1a1a1a; --text-2: #555; --text-3: #888;
      --red: #DC2626; --amber: #D97706; --gold: #B45309;
      --green: #16a34a; --purple: #4f46e5;
      --green-dim: rgba(22,163,74,0.1); --red-dim: rgba(220,38,38,0.1);
      --amber-dim: rgba(217,119,6,0.1); --purple-dim: rgba(79,70,229,0.1);
      --nav-bg: rgba(255,255,255,0.95);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: 'DM Sans', -apple-system, sans-serif; min-height: 100vh; transition: background 0.3s, color 0.3s; }
    .nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 40px; border-bottom: 1px solid var(--border); background: var(--nav-bg); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 50; transition: background 0.3s, border-color 0.3s; }
    .nav-brand { display: flex; align-items: center; gap: 14px; }
    .nav-brand svg { width: 28px; height: 28px; }
    .nav-brand span { font-weight: 600; font-size: 0.85rem; letter-spacing: 4px; color: var(--text); }
    .nav-status { display: flex; align-items: center; gap: 8px; font-size: 0.7rem; color: var(--text-3); letter-spacing: 1px; }
    .theme-toggle { background: var(--surface); border: 1px solid var(--border); color: var(--amber); font-size: 1rem; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s; }
    .theme-toggle:hover { border-color: var(--amber); background: var(--amber-dim); }
    .sortable { cursor: pointer; user-select: none; white-space: nowrap; }
    .sortable:hover { color: var(--amber); }
    .sort-arrow { font-size: 0.6rem; opacity: 0.4; }
    .sort-arrow.asc::after { content: '▲'; opacity: 1; color: var(--amber); }
    .sort-arrow.desc::after { content: '▼'; opacity: 1; color: var(--amber); }
    .nav-status .dot { width: 6px; height: 6px; border-radius: 50%; background: ${isLive || isPoly ? 'var(--green)' : 'var(--red)'}; animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 32px 80px; }
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 40px; }
    .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 24px; position: relative; overflow: hidden; transition: background 0.3s, border-color 0.3s; }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .stat-card.accent::before { background: linear-gradient(90deg, var(--red), var(--amber), var(--gold)); }
    .stat-label { font-size: 0.65rem; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: var(--text-3); margin-bottom: 12px; }
    .stat-value { font-family: 'JetBrains Mono', monospace; font-size: 1.75rem; font-weight: 600; color: var(--text); }
    .stat-value.green { color: var(--green); } .stat-value.red { color: var(--red); }
    .stat-sub { font-size: 0.7rem; color: var(--text-3); margin-top: 6px; letter-spacing: 0.5px; }
    .section { margin-bottom: 40px; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .section-title { font-size: 0.7rem; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: var(--text-2); }
    .section-badge { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--text-3); background: var(--surface); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border); letter-spacing: 1px; }
    .live-badge { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--green); background: var(--green-dim); padding: 4px 10px; border-radius: 20px; letter-spacing: 1px; }
    .poly-badge { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--purple); background: var(--purple-dim); padding: 4px 10px; border-radius: 20px; letter-spacing: 1px; }
    .arb-badge { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--amber); background: var(--amber-dim); padding: 4px 10px; border-radius: 20px; letter-spacing: 1px; }
    .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 0.6rem; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--text-3); padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
    td { padding: 16px 20px; font-size: 0.85rem; border-bottom: 1px solid #141414; color: var(--text); }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.015); }
    .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 600; padding: 4px 12px; border-radius: 20px; letter-spacing: 0.5px; }
    .badge-yes { background: var(--green-dim); color: var(--green); }
    .badge-no { background: var(--red-dim); color: var(--red); }
    .badge-watch { background: var(--amber-dim); color: var(--amber); }
    .badge-trig { background: var(--red-dim); color: var(--red); }
    .pnl-pos { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--green); }
    .pnl-neg { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--red); }
    .mono { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; }
    .price-cell { display: flex; align-items: center; gap: 8px; }
    .price-num { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; min-width: 36px; text-align: right; }
    .price-cell svg { flex-shrink: 0; opacity: 0.8; }
    .price-track { flex: 1; max-width: 100px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .price-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, var(--red), var(--amber)); }
    .market-ticker { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--text-3); background: var(--surface-2); padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
    .market-title { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
    .market-link { color: var(--text); text-decoration: none; transition: color 0.2s; }
    .market-link:hover { color: var(--amber); }
    .search-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .search-bar input { flex: 1; min-width: 200px; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 12px 18px; border-radius: 12px; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; outline: none; transition: border-color 0.2s; }
    .search-bar input:focus { border-color: var(--amber); }
    .search-bar input::placeholder { color: var(--text-3); }
    .filter-tabs { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
    .filter-tab { background: none; border: none; color: var(--text-3); font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; padding: 8px 16px; border-radius: 8px; cursor: pointer; letter-spacing: 0.5px; transition: all 0.2s; }
    .filter-tab:hover { color: var(--text-2); }
    .filter-tab.active { background: var(--border); color: var(--amber); }
    .vol { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-2); }
    .delta { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 600; }
    .delta-up { color: var(--green); }
    .delta-down { color: var(--red); }
    .delta-flat { color: var(--text-3); }
    .star { cursor: pointer; font-size: 0.85rem; color: var(--text-3); transition: color 0.2s; margin-right: 6px; }
    .star:hover { color: var(--gold); }
    .star.starred { color: var(--gold); }
    .wl-src { font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; font-weight: 600; padding: 3px 8px; border-radius: 4px; letter-spacing: 1px; }
    .wl-kalshi { color: var(--green); background: var(--green-dim); }
    .wl-poly { color: var(--purple); background: var(--purple-dim); }
    .movers-badge { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--gold); background: rgba(251,191,36,0.1); padding: 4px 10px; border-radius: 20px; letter-spacing: 1px; }
    .movers-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
    .mover-card { flex: 0 0 200px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 20px; text-decoration: none; transition: border-color 0.2s; }
    .mover-card:hover { border-color: var(--amber); }
    .mover-delta { font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; }
    .mover-title { font-size: 0.8rem; color: var(--text); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mover-meta { font-size: 0.7rem; color: var(--text-3); display: flex; align-items: center; gap: 8px; }
    .empty { text-align: center; padding: 40px 20px; color: var(--text-3); font-size: 0.85rem; }
    .arb-spread { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 0.85rem; }
    .arb-low { color: var(--text-2); } .arb-mid { color: var(--amber); } .arb-high { color: var(--red); }
    .arb-direction { font-size: 0.7rem; color: var(--text-2); letter-spacing: 0.5px; }
    .alert-form { display: flex; gap: 10px; padding: 16px 20px; background: var(--surface-2); border-top: 1px solid var(--border); align-items: center; flex-wrap: wrap; }
    .alert-form input, .alert-form select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 10px 14px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; outline: none; }
    .alert-form input:focus, .alert-form select:focus { border-color: var(--amber); }
    .alert-form input[name="market"] { flex: 1; min-width: 200px; }
    .alert-form select { width: 100px; }
    .alert-form input[name="target"] { width: 90px; }
    .alert-form button { background: linear-gradient(135deg, var(--red), var(--amber)); color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 600; cursor: pointer; letter-spacing: 0.5px; }
    .alert-form button:hover { opacity: 0.85; }
    .delete-btn { background: none; border: none; color: var(--text-3); cursor: pointer; font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; }
    .delete-btn:hover { color: var(--red); }
    .shortcut-bar { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; padding: 16px 20px 0; }
    .shortcut-hint { font-size: 0.65rem; color: var(--text-3); display: flex; align-items: center; gap: 4px; }
    kbd { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; background: var(--surface); border: 1px solid var(--border); color: var(--text-2); padding: 2px 6px; border-radius: 4px; }
    .shortcuts-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 999; justify-content: center; align-items: center; }
    .shortcuts-overlay.visible { display: flex; }
    .shortcuts-modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 32px; max-width: 420px; width: 90%; }
    .shortcuts-modal h2 { font-size: 0.75rem; letter-spacing: 3px; text-transform: uppercase; color: var(--text-2); margin-bottom: 20px; }
    .shortcut-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .shortcut-row:last-child { border-bottom: none; }
    .shortcut-row .label { font-size: 0.85rem; color: var(--text); }
    .shortcut-row kbd { font-size: 0.75rem; padding: 4px 10px; }
    .footer { text-align: center; padding: 20px 20px 40px; font-size: 0.6rem; color: var(--text-3); letter-spacing: 2px; text-transform: uppercase; }
    @media (max-width: 768px) { .container { padding: 24px 16px 60px; } .stats-row { grid-template-columns: repeat(2, 1fr); } .nav { padding: 16px 20px; } th, td { padding: 12px 14px; font-size: 0.78rem; } }
  </style>
</head>
<body>
  <nav class="nav">
    <div class="nav-brand">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="navGrad" x1="50%" y1="100%" x2="50%" y2="0%"><stop offset="0%" stop-color="#DC2626"/><stop offset="50%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#FBBF24"/></linearGradient></defs>
        <path d="M15 62 L50 25 L85 62 Z" fill="url(#navGrad)"/><line x1="8" y1="62" x2="92" y2="62" stroke="#fff" stroke-width="3"/>
      </svg>
      <span>DAYLIGHT</span>
    </div>
    <div class="nav-status">
      <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">☀</button>
      <span class="dot"></span>
      ${isLive ? 'KALSHI' : ''} ${isLive && isPoly ? '+' : ''} ${isPoly ? 'POLY' : ''} ${!isLive && !isPoly ? 'OFFLINE' : ''} &middot; v2.1 &middot; <span id="countdown">60</span>s
    </div>
  </nav>
  <div class="container">
    <div class="stats-row">
      <div class="stat-card accent">
        <div class="stat-label">Live Markets</div>
        <div class="stat-value">${totalMarkets}</div>
        <div class="stat-sub">${markets.length} Kalshi · ${poly.length} Polymarket</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">24h Volume</div>
        <div class="stat-value">${totalVol24h > 999999 ? '$' + (totalVol24h / 1000000).toFixed(1) + 'M' : totalVol24h > 999 ? '$' + (totalVol24h / 1000).toFixed(1) + 'k' : '$' + totalVol24h}</div>
        <div class="stat-sub">across both platforms</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Yes Price</div>
        <div class="stat-value">${avgPrice}&cent;</div>
        <div class="stat-sub">${allPrices.filter(p => p >= 80).length} markets above 80¢</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Arb Opps</div>
        <div class="stat-value ${arbOpps.length > 0 ? 'green' : ''}">${arbOpps.length}</div>
        <div class="stat-sub">${arbOpps.length ? arbOpps[0].spread + '¢ best spread' : 'none found'}</div>
      </div>
    </div>

    <!-- TOP MOVERS -->
    ${topMovers.length ? `<div class="section">
      <div class="section-header">
        <span class="section-title">Top Movers</span>
        <span class="movers-badge">${topMovers.length} MOVING</span>
      </div>
      <div class="movers-row">
        ${topMovers.map(m => `<a href="${m.link}" class="mover-card">
          <div class="mover-delta ${m.delta > 0 ? 'delta-up' : 'delta-down'}">${m.delta > 0 ? '↑' : '↓'} ${m.delta > 0 ? '+' : ''}${m.delta}¢</div>
          <div class="mover-title">${m.title}</div>
          <div class="mover-meta"><span class="wl-src wl-${m.source}">${m.source === 'kalshi' ? 'K' : 'P'}</span> ${m.yesPrice}¢ Yes</div>
        </a>`).join('')}
      </div>
    </div>` : ''}

    <!-- WATCHLIST -->
    ${enrichedWatchlist.length ? `<div class="section">
      <div class="section-header">
        <span class="section-title">Watchlist</span>
        <span class="section-badge">${enrichedWatchlist.length} STARRED</span>
      </div>
      <div class="table-wrap"><table>
        <tr><th>Market</th><th>Source</th><th>Yes</th><th>&Delta;</th><th></th></tr>
        ${enrichedWatchlist.map(w => `<tr>
          <td><a href="${w.link}" class="market-link"><span class="market-title">${w.title}</span></a></td>
          <td><span class="wl-src wl-${w.source}">${w.source === 'kalshi' ? 'K' : 'P'}</span></td>
          <td class="mono">${w.yesPrice}${w.yesPrice !== '?' ? '¢' : ''}</td>
          <td class="delta ${w.delta > 0 ? 'delta-up' : w.delta < 0 ? 'delta-down' : 'delta-flat'}">${w.delta === null ? '—' : w.delta > 0 ? '+' + w.delta + '¢' : w.delta < 0 ? w.delta + '¢' : '0'}</td>
          <td><button class="delete-btn" onclick="removeStar('${w.id}')">&times;</button></td>
        </tr>`).join('')}
      </table></div>
    </div>` : ''}

    <!-- POSITIONS -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">Positions</span>
        <span class="section-badge">${positions.length} OPEN &middot; ${isRealPortfolio ? 'LIVE' : 'MOCK'}</span>
      </div>
      <div class="table-wrap"><table>
        <tr><th>Market</th><th>Side</th><th>Qty</th><th>Avg</th><th>Current</th><th>P&L</th></tr>
        ${positions.map(p => `<tr>
          <td>${p.market}</td>
          <td><span class="badge ${p.position === 'Yes' ? 'badge-yes' : 'badge-no'}">${p.position}</span></td>
          <td class="mono">${p.qty}</td><td class="mono">${p.avgPrice}&cent;</td><td class="mono">${p.currentPrice}&cent;</td>
          <td class="${p.pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">${p.pnl >= 0 ? '+' : ''}${p.pnl}&cent;</td>
        </tr>`).join('')}
      </table></div>
    </div>

    <!-- ARBITRAGE -->
    ${arbOpps.length ? `<div class="section">
      <div class="section-header">
        <span class="section-title">Arbitrage</span>
        <span class="arb-badge">${arbOpps.length} OPPORTUNITIES</span>
      </div>
      <div class="table-wrap"><table>
        <tr><th>Kalshi Market</th><th>Polymarket Match</th><th>K</th><th>P</th><th>Spread</th><th>Direction</th></tr>
        ${arbOpps.map(a => `<tr>
          <td><span class="market-title">${a.kalshiTitle}</span></td>
          <td><span class="market-title">${a.polyTitle}</span></td>
          <td class="mono">${a.kalshiPrice}&cent;</td>
          <td class="mono">${a.polyPrice}&cent;</td>
          <td><span class="arb-spread ${a.spread >= 10 ? 'arb-high' : a.spread >= 5 ? 'arb-mid' : 'arb-low'}">${a.spread}&cent;</span></td>
          <td class="arb-direction">${a.direction}</td>
        </tr>`).join('')}
      </table></div>
    </div>` : ''}

    <!-- SEARCH/FILTER -->
    <div class="search-bar">
      <input type="text" id="marketSearch" placeholder="Search markets..." oninput="filterMarkets()">
      <div class="filter-tabs">
        <button class="filter-tab active" onclick="setFilter('all')">All</button>
        <button class="filter-tab" onclick="setFilter('kalshi')">Kalshi</button>
        <button class="filter-tab" onclick="setFilter('poly')">Polymarket</button>
      </div>
    </div>

    <!-- KALSHI MARKETS -->
    <div class="section" id="kalshi-section">
      <div class="section-header">
        <span class="section-title">Markets</span>
        ${isLive ? '<span class="live-badge">LIVE &middot; KALSHI API</span>' : '<span class="section-badge">OFFLINE</span>'}
      </div>
      <div class="table-wrap">
        ${markets.length ? `<table>
          <tr><th>Market</th><th>Ticker</th><th class="sortable" onclick="sortTable('kalshi-section',2,'num')">Yes <span class="sort-arrow"></span></th><th class="sortable" onclick="sortTable('kalshi-section',3,'num')">Δ <span class="sort-arrow"></span></th><th class="sortable" onclick="sortTable('kalshi-section',4,'num')">Vol 24h <span class="sort-arrow"></span></th></tr>
          ${markets.map(m => `<tr>
            <td><span class="star ${wlSet.has(m.ticker) ? 'starred' : ''}" onclick="toggleStar('${m.ticker}', '${m.title.replace(/'/g, "\\'")}', 'kalshi', '/market/${encodeURIComponent(m.ticker)}')">${wlSet.has(m.ticker) ? '★' : '☆'}</span> <a href="/market/${encodeURIComponent(m.ticker)}" class="market-link"><span class="market-title">${m.title}</span></a></td>
            <td><span class="market-ticker">${m.ticker}</span></td>
            <td><div class="price-cell"><span class="price-num">${m.yesPrice}&cent;</span>${sparklineSvg(priceHistory['k:' + m.ticker])}<div class="price-track"><div class="price-fill" style="width:${m.yesPrice}%"></div></div></div></td>
            <td class="delta ${m.delta > 0 ? 'delta-up' : m.delta < 0 ? 'delta-down' : 'delta-flat'}">${m.delta === null ? '—' : m.delta > 0 ? '+' + m.delta + '¢' : m.delta < 0 ? m.delta + '¢' : '0'}</td>
            <td class="vol">${m.volume24h > 999 ? (m.volume24h / 1000).toFixed(1) + 'k' : m.volume24h}</td>
          </tr>`).join('')}
        </table>` : '<div class="empty">Could not reach Kalshi API</div>'}
      </div>
    </div>

    <!-- POLYMARKET -->
    <div class="section" id="poly-section">
      <div class="section-header">
        <span class="section-title">Polymarket</span>
        ${isPoly ? '<span class="poly-badge">LIVE &middot; GAMMA API</span>' : '<span class="section-badge">OFFLINE</span>'}
      </div>
      <div class="table-wrap">
        ${poly.length ? `<table>
          <tr><th>Market</th><th class="sortable" onclick="sortTable('poly-section',1,'num')">Yes <span class="sort-arrow"></span></th><th class="sortable" onclick="sortTable('poly-section',2,'num')">Δ <span class="sort-arrow"></span></th><th class="sortable" onclick="sortTable('poly-section',3,'num')">Vol 24h <span class="sort-arrow"></span></th><th class="sortable" onclick="sortTable('poly-section',4,'num')">Liquidity <span class="sort-arrow"></span></th></tr>
          ${poly.map(m => `<tr>
            <td><span class="star ${wlSet.has(m.slug) ? 'starred' : ''}" onclick="toggleStar('${m.slug}', '${m.title.replace(/'/g, "\\'")}', 'poly', '/poly/${encodeURIComponent(m.slug)}')">${wlSet.has(m.slug) ? '★' : '☆'}</span> <a href="/poly/${encodeURIComponent(m.slug)}" class="market-link"><span class="market-title">${m.title}</span></a></td>
            <td><div class="price-cell"><span class="price-num">${m.yesPrice}&cent;</span>${sparklineSvg(priceHistory['p:' + m.slug])}<div class="price-track"><div class="price-fill" style="width:${m.yesPrice}%;background:linear-gradient(90deg, #6366f1, #818cf8)"></div></div></div></td>
            <td class="delta ${m.delta > 0 ? 'delta-up' : m.delta < 0 ? 'delta-down' : 'delta-flat'}">${m.delta === null ? '—' : m.delta > 0 ? '+' + m.delta + '¢' : m.delta < 0 ? m.delta + '¢' : '0'}</td>
            <td class="vol">${m.volume > 999 ? '$' + (m.volume / 1000).toFixed(1) + 'k' : '$' + m.volume}</td>
            <td class="vol">${m.liquidity > 999 ? '$' + (m.liquidity / 1000).toFixed(1) + 'k' : '$' + m.liquidity}</td>
          </tr>`).join('')}
        </table>` : '<div class="empty">Could not reach Polymarket API</div>'}
      </div>
    </div>

    <!-- ALERTS -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">Alerts</span>
        <span class="section-badge">${alerts.length} SET</span>
      </div>
      <div class="table-wrap">
        ${alerts.length ? `<table>
          <tr><th>Market</th><th>Condition</th><th>Target</th><th>Status</th><th></th></tr>
          ${alerts.map(a => `<tr>
            <td>${a.marketName}</td>
            <td class="mono">${a.condition}</td>
            <td class="mono">${a.targetPrice}&cent;</td>
            <td><span class="badge ${a.triggered ? 'badge-trig' : 'badge-watch'}">${a.triggered ? 'TRIGGERED' : 'watching'}</span></td>
            <td><button class="delete-btn" onclick="deleteAlert('${a.id}')">&times;</button></td>
          </tr>`).join('')}
        </table>` : ''}
        <div class="alert-form">
          <input name="market" type="text" placeholder="Market name (e.g. BTC above $100k)">
          <select name="condition"><option value="above">above</option><option value="below">below</option></select>
          <input name="target" type="number" placeholder="50" min="1" max="99">
          <button onclick="addAlert()">Set Alert</button>
        </div>
      </div>
    </div>
  </div>

  <div class="shortcut-bar">
    <span class="shortcut-hint"><kbd>/</kbd> Search</span>
    <span class="shortcut-hint"><kbd>R</kbd> Refresh</span>
    <span class="shortcut-hint"><kbd>T</kbd> Theme</span>
    <span class="shortcut-hint"><kbd>J</kbd><kbd>K</kbd> Scroll</span>
    <span class="shortcut-hint"><kbd>G</kbd> Top</span>
    <span class="shortcut-hint"><kbd>Esc</kbd> Clear</span>
  </div>
  <div class="footer">Daylight &middot; Prediction Market Intelligence &middot; Day 21 &middot; v2.1 &middot; Sparklines</div>

  <script>
    // Theme toggle
    (function() {
      const saved = localStorage.getItem('daylight-theme');
      if (saved === 'light') document.documentElement.classList.add('light');
    })();
    function toggleTheme() {
      const root = document.documentElement;
      root.classList.toggle('light');
      const isLight = root.classList.contains('light');
      localStorage.setItem('daylight-theme', isLight ? 'light' : 'dark');
      document.querySelector('.theme-toggle').textContent = isLight ? '☾' : '☀';
    }
    // Set correct icon on load
    document.addEventListener('DOMContentLoaded', () => {
      const isLight = document.documentElement.classList.contains('light');
      const btn = document.querySelector('.theme-toggle');
      if (btn) btn.textContent = isLight ? '☾' : '☀';
    });

    let seconds = 60;
    const el = document.getElementById('countdown');
    window.addEventListener('load', () => {
      setInterval(() => {
        seconds--;
        if (el) el.textContent = seconds;
        if (seconds <= 0) location.reload();
      }, 1000);
    });

    let currentFilter = 'all';
    function setFilter(f) {
      currentFilter = f;
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');
      const ks = document.getElementById('kalshi-section');
      const ps = document.getElementById('poly-section');
      if (f === 'all') { ks.style.display = ''; ps.style.display = ''; }
      else if (f === 'kalshi') { ks.style.display = ''; ps.style.display = 'none'; }
      else { ks.style.display = 'none'; ps.style.display = ''; }
      filterMarkets();
    }
    let sortState = {};
    function sortTable(sectionId, colIdx, type) {
      const section = document.getElementById(sectionId);
      if (!section) return;
      const table = section.querySelector('table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tr')).filter(r => !r.querySelector('th'));
      const key = sectionId + '-' + colIdx;
      const dir = sortState[key] === 'asc' ? 'desc' : 'asc';
      sortState[key] = dir;
      // Clear all arrows in this section
      section.querySelectorAll('.sort-arrow').forEach(a => { a.className = 'sort-arrow'; });
      // Set active arrow
      const headers = table.querySelectorAll('th.sortable');
      headers.forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) {
          const thIdx = Array.from(th.parentElement.children).indexOf(th);
          if (thIdx === colIdx) arrow.className = 'sort-arrow ' + dir;
        }
      });
      rows.sort((a, b) => {
        let aVal = a.children[colIdx]?.textContent?.trim() || '';
        let bVal = b.children[colIdx]?.textContent?.trim() || '';
        // Parse numeric values
        aVal = parseFloat(aVal.replace(/[^0-9.\-]/g, '')) || 0;
        bVal = parseFloat(bVal.replace(/[^0-9.\-]/g, '')) || 0;
        return dir === 'asc' ? aVal - bVal : bVal - aVal;
      });
      const tbody = table.querySelector('tbody') || table;
      rows.forEach(r => tbody.appendChild(r));
    }

    function filterMarkets() {
      const q = document.getElementById('marketSearch').value.toLowerCase().trim();
      document.querySelectorAll('#kalshi-section tr, #poly-section tr').forEach(row => {
        if (row.querySelector('th')) return;
        const text = row.textContent.toLowerCase();
        row.style.display = q && !text.includes(q) ? 'none' : '';
      });
    }

    async function toggleStar(id, title, source, link) {
      const el = event.target;
      if (el.classList.contains('starred')) {
        await fetch('/api/watchlist/' + encodeURIComponent(id), { method: 'DELETE' });
      } else {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, title, source, link })
        });
      }
      location.reload();
    }
    async function removeStar(id) {
      await fetch('/api/watchlist/' + encodeURIComponent(id), { method: 'DELETE' });
      location.reload();
    }

    async function addAlert() {
      const market = document.querySelector('input[name="market"]').value.trim();
      const condition = document.querySelector('select[name="condition"]').value;
      const target = document.querySelector('input[name="target"]').value;
      if (!market || !target) return;
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketName: market, condition, targetPrice: target })
      });
      location.reload();
    }
    async function deleteAlert(id) {
      await fetch('/api/alerts/' + id, { method: 'DELETE' });
      location.reload();
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      const isInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT';

      if (e.key === 'Escape') {
        const search = document.getElementById('marketSearch');
        if (search) { search.value = ''; filterMarkets(); search.blur(); }
        return;
      }

      if (isInput) return; // Don't trigger shortcuts while typing

      if (e.key === '/' || e.key === 's') {
        e.preventDefault();
        const search = document.getElementById('marketSearch');
        if (search) search.focus();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        location.reload();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleTheme();
      } else if (e.key === 'j') {
        window.scrollBy({ top: 200, behavior: 'smooth' });
      } else if (e.key === 'k') {
        window.scrollBy({ top: -200, behavior: 'smooth' });
      } else if (e.key === 'g') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.key === 'G') {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      } else if (e.key === '?') {
        e.preventDefault();
        document.getElementById('shortcutsOverlay').classList.toggle('visible');
      }
    });
  </script>
  <div class="shortcuts-overlay" id="shortcutsOverlay" onclick="if(event.target===this)this.classList.remove('visible')">
    <div class="shortcuts-modal">
      <h2>Keyboard Shortcuts</h2>
      <div class="shortcut-row"><span class="label">Search markets</span><kbd>/</kbd></div>
      <div class="shortcut-row"><span class="label">Refresh data</span><kbd>R</kbd></div>
      <div class="shortcut-row"><span class="label">Toggle theme</span><kbd>T</kbd></div>
      <div class="shortcut-row"><span class="label">Scroll down</span><kbd>J</kbd></div>
      <div class="shortcut-row"><span class="label">Scroll up</span><kbd>K</kbd></div>
      <div class="shortcut-row"><span class="label">Jump to top</span><kbd>G</kbd></div>
      <div class="shortcut-row"><span class="label">Jump to bottom</span><kbd>⇧G</kbd></div>
      <div class="shortcut-row"><span class="label">Clear search</span><kbd>Esc</kbd></div>
      <div class="shortcut-row"><span class="label">Show this help</span><kbd>?</kbd></div>
    </div>
  </div>
</body>
</html>`);
});

// Kalshi market detail page
app.get('/market/:ticker', async (req, res) => {
  try {
    const r = await axios.get(API + '/markets/' + req.params.ticker);
    const m = r.data.market;
    const event = m.event_ticker ? await axios.get(API + '/events/' + m.event_ticker).then(r => r.data.event).catch(() => null) : null;
    const title = event ? event.title : m.title || m.ticker;
    const yesPrice = m.yes_bid || m.last_price || 0;
    const noPrice = m.no_bid || (100 - yesPrice);
    res.send(detailPage({
      title, source: 'Kalshi', sourceColor: '#22c55e', ticker: m.ticker, yesPrice, noPrice,
      volume: m.volume || 0, volume24h: m.volume_24h || 0, status: m.status || 'open',
      link: 'https://kalshi.com/markets/' + m.ticker.toLowerCase(),
      extra: [
        { label: 'Open Interest', value: (m.open_interest || 0).toLocaleString() },
        { label: 'Open Time', value: m.open_time ? new Date(m.open_time).toLocaleDateString() : 'N/A' },
        { label: 'Close Time', value: m.close_time ? new Date(m.close_time).toLocaleDateString() : 'N/A' },
      ]
    }));
  } catch (err) {
    res.status(404).send('<h1>Market not found</h1><a href="/">Back</a>');
  }
});

// Polymarket detail page
app.get('/poly/:slug', async (req, res) => {
  try {
    const r = await axios.get('https://gamma-api.polymarket.com/markets', { params: { slug: req.params.slug } });
    const m = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!m) throw new Error('Not found');
    const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
    const yesPrice = prices[0] ? Math.round(parseFloat(prices[0]) * 100) : 0;
    const noPrice = prices[1] ? Math.round(parseFloat(prices[1]) * 100) : (100 - yesPrice);
    res.send(detailPage({
      title: m.question || m.groupItemTitle || 'Untitled', source: 'Polymarket', sourceColor: '#6366f1',
      ticker: m.slug || req.params.slug, yesPrice, noPrice,
      volume: Math.round(parseFloat(m.volume || 0)), volume24h: Math.round(parseFloat(m.volume24hr || 0)),
      status: m.active ? 'open' : 'closed',
      link: 'https://polymarket.com/event/' + (m.slug || req.params.slug),
      extra: [
        { label: 'Liquidity', value: '$' + Math.round(parseFloat(m.liquidityNum || 0)).toLocaleString() },
        { label: 'End Date', value: m.endDate ? new Date(m.endDate).toLocaleDateString() : 'N/A' },
      ]
    }));
  } catch (err) {
    res.status(404).send('<h1>Market not found</h1><a href="/">Back</a>');
  }
});

function detailPage({ title, source, sourceColor, ticker, yesPrice, noPrice, volume, volume24h, status, link, extra }) {
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Daylight</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --bg:#0a0a0a;--surface:#111;--border:#1e1e1e;--text:#e8e8e8;--text-2:#888;--text-3:#555;--red:#DC2626;--amber:#F59E0B;--green:#22c55e; }
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh}
    .nav{display:flex;align-items:center;justify-content:space-between;padding:20px 40px;border-bottom:1px solid var(--border)}
    .nav-brand{display:flex;align-items:center;gap:14px;text-decoration:none}
    .nav-brand span{font-weight:600;font-size:0.85rem;letter-spacing:4px;color:#fff}
    .back{color:var(--text-3);text-decoration:none;font-size:0.75rem;letter-spacing:1px}
    .back:hover{color:var(--amber)}
    .wrap{max-width:800px;margin:60px auto;padding:0 32px}
    .src{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:0.6rem;padding:4px 12px;border-radius:20px;letter-spacing:1px;margin-bottom:16px}
    h1{font-size:1.6rem;font-weight:600;color:#fff;line-height:1.3;margin-bottom:8px}
    .ticker{font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--text-3);margin-bottom:40px}
    .prices{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:40px}
    .pbox{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center}
    .plabel{font-size:0.65rem;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--text-3);margin-bottom:12px}
    .pbig{font-family:'JetBrains Mono',monospace;font-size:2.5rem;font-weight:700}
    .pbig.yes{color:var(--green)}.pbig.no{color:var(--red)}
    .bar{margin-bottom:40px}.bartrack{height:12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;overflow:hidden}
    .barfill{height:100%;border-radius:6px}
    .barlabels{display:flex;justify-content:space-between;margin-top:8px;font-size:0.65rem;color:var(--text-3);letter-spacing:1px}
    .sgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:40px}
    .sitem{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px}
    .slabel{font-size:0.6rem;letter-spacing:2px;text-transform:uppercase;color:var(--text-3);margin-bottom:8px}
    .sval{font-family:'JetBrains Mono',monospace;font-size:1rem;color:#fff}
    .erow{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #141414}
    .elabel{font-size:0.75rem;color:var(--text-3);letter-spacing:1px}
    .eval{font-size:0.8rem;color:var(--text);max-width:60%;text-align:right}
    .tbtn{display:inline-block;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:0.85rem;letter-spacing:0.5px;margin-top:32px}
    .tbtn:hover{opacity:0.85}
    .foot{text-align:center;padding:60px 20px 40px;font-size:0.6rem;color:#222;letter-spacing:2px}
  </style>
</head><body>
  <nav class="nav">
    <a href="/" class="nav-brand">
      <svg viewBox="0 0 100 100" width="28" height="28" fill="none"><defs><linearGradient id="g" x1="50%" y1="100%" x2="50%" y2="0%"><stop offset="0%" stop-color="#DC2626"/><stop offset="50%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#FBBF24"/></linearGradient></defs><path d="M15 62 L50 25 L85 62 Z" fill="url(#g)"/><line x1="8" y1="62" x2="92" y2="62" stroke="#fff" stroke-width="3"/></svg>
      <span>DAYLIGHT</span>
    </a>
    <a href="/" class="back">&larr; BACK TO DASHBOARD</a>
  </nav>
  <div class="wrap">
    <div class="src" style="color:${sourceColor};background:${sourceColor}18">${source.toUpperCase()}</div>
    <h1>${title}</h1>
    <div class="ticker">${ticker} &middot; ${status.toUpperCase()}</div>
    <div class="prices">
      <div class="pbox"><div class="plabel">Yes Price</div><div class="pbig yes">${yesPrice}&cent;</div></div>
      <div class="pbox"><div class="plabel">No Price</div><div class="pbig no">${noPrice}&cent;</div></div>
    </div>
    <div class="bar"><div class="bartrack"><div class="barfill" style="width:${yesPrice}%;background:linear-gradient(90deg,${sourceColor},${sourceColor}99)"></div></div>
      <div class="barlabels"><span>0&cent;</span><span>${yesPrice}&cent; YES</span><span>100&cent;</span></div></div>
    <div class="sgrid">
      <div class="sitem"><div class="slabel">Total Volume</div><div class="sval">${volume > 999 ? (volume/1000).toFixed(1)+'k' : volume}</div></div>
      <div class="sitem"><div class="slabel">24h Volume</div><div class="sval">${volume24h > 999 ? (volume24h/1000).toFixed(1)+'k' : volume24h}</div></div>
    </div>
    ${extra.length ? extra.map(e => '<div class="erow"><span class="elabel">'+e.label+'</span><span class="eval">'+e.value+'</span></div>').join('') : ''}
    <a href="${link}" target="_blank" class="tbtn" style="background:linear-gradient(135deg,${sourceColor},${sourceColor}cc)">Trade on ${source} &rarr;</a>
  </div>
  <div class="foot">Daylight &middot; Market Detail &middot; v1.1</div>
</body></html>`;
}

// Init Kalshi auth on startup
if (process.env.KALSHI_API_KEY_ID && process.env.KALSHI_PRIVATE_KEY_PATH) {
  initKalshiAuth();
} else {
  console.log('No KALSHI_API_KEY_ID/KALSHI_PRIVATE_KEY_PATH in .env — using mock portfolio');
}

app.listen(3000, () => {
  console.log('Daylight v1.6 running at http://localhost:3000');
});