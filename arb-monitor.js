// arb-monitor.js - Day 21: Background Arbitrage Alert System
const axios = require('axios');
const fs = require('fs');

const API = 'https://api.elections.kalshi.com/trade-api/v2';
const ARB_LOG_FILE = './arb-history.json';
const ARB_CONFIG_FILE = './arb-config.json';
const ALERTS_FILE = './alerts.json';

// Default config
function loadArbConfig() {
  try { return JSON.parse(fs.readFileSync(ARB_CONFIG_FILE, 'utf8')); }
  catch { return { minSpread: 5, autoAlert: true, checkInterval: 300000 }; } // 5¢ min, 5 min interval
}
function saveArbConfig(config) {
  fs.writeFileSync(ARB_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadArbHistory() {
  try { return JSON.parse(fs.readFileSync(ARB_LOG_FILE, 'utf8')); }
  catch { return []; }
}
function saveArbHistory(history) {
  // Keep last 200 entries
  const trimmed = history.slice(-200);
  fs.writeFileSync(ARB_LOG_FILE, JSON.stringify(trimmed, null, 2));
}

function loadAlerts() {
  try { return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8')); }
  catch { return []; }
}

// Normalize + similarity (same logic as server.js)
function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}
function similarity(a, b) {
  const wordsA = normalize(a).split(' ');
  const wordsB = normalize(b).split(' ');
  const common = wordsA.filter(w => w.length > 2 && wordsB.includes(w));
  return common.length / Math.max(wordsA.length, wordsB.length);
}

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
        volume: best.volume || 0,
      });
    }
    return results;
  } catch (err) {
    console.error('[arb-monitor] Kalshi fetch error:', err.message);
    return [];
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
      });
    }
    return results;
  } catch (err) {
    console.error('[arb-monitor] Polymarket fetch error:', err.message);
    return [];
  }
}

async function scanArbs() {
  const config = loadArbConfig();
  const [kalshi, poly] = await Promise.all([fetchKalshiMarkets(), fetchPolymarkets()]);

  if (!kalshi.length || !poly.length) {
    console.log('[arb-monitor] Missing data — Kalshi:', kalshi.length, 'Poly:', poly.length);
    return [];
  }

  const found = [];
  for (const k of kalshi) {
    for (const p of poly) {
      const sim = similarity(k.title, p.title);
      if (sim >= 0.4) {
        const spread = Math.abs(k.yesPrice - p.yesPrice);
        if (spread >= config.minSpread) {
          found.push({
            id: 'arb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            kalshiTitle: k.title,
            kalshiTicker: k.ticker,
            polyTitle: p.title,
            polySlug: p.slug,
            kalshiPrice: k.yesPrice,
            polyPrice: p.yesPrice,
            spread,
            direction: k.yesPrice > p.yesPrice ? 'Buy Poly / Sell Kalshi' : 'Buy Kalshi / Sell Poly',
            profitPer100: Math.round((spread / 100) * 100 * 100) / 100, // profit per $100 deployed
            detectedAt: new Date().toISOString(),
            status: 'open',
          });
        }
      }
    }
  }

  // Log to history
  const history = loadArbHistory();
  const now = new Date().toISOString();

  // Mark old open arbs as closed if no longer found
  history.forEach(h => {
    if (h.status === 'open') {
      const stillExists = found.some(f =>
        f.kalshiTicker === h.kalshiTicker && f.polySlug === h.polySlug && f.spread >= config.minSpread
      );
      if (!stillExists) {
        h.status = 'closed';
        h.closedAt = now;
        h.duration = Math.round((new Date(now) - new Date(h.detectedAt)) / 60000); // minutes
      }
    }
  });

  // Add new arbs (dedupe by ticker+slug combo)
  for (const arb of found) {
    const alreadyTracked = history.some(h =>
      h.kalshiTicker === arb.kalshiTicker && h.polySlug === arb.polySlug && h.status === 'open'
    );
    if (!alreadyTracked) {
      history.push(arb);
      console.log(`[arb-monitor] NEW ARB: ${arb.spread}¢ spread — ${arb.kalshiTitle} | ${arb.direction}`);

      // Auto-create alert if enabled
      if (config.autoAlert) {
        const alerts = loadAlerts();
        const alertExists = alerts.some(a =>
          a.marketName.includes('ARB:') &&
          a.marketName.includes(arb.kalshiTicker) &&
          !a.triggered
        );
        if (!alertExists) {
          alerts.push({
            id: 'arb-alert-' + Date.now(),
            marketId: 'arb',
            marketName: `ARB: ${arb.kalshiTitle.slice(0, 40)} (${arb.spread}¢)`,
            condition: 'spread ≥',
            targetPrice: arb.spread,
            triggered: true,
            triggeredAt: now,
            createdAt: now,
            arbData: {
              kalshiPrice: arb.kalshiPrice,
              polyPrice: arb.polyPrice,
              direction: arb.direction,
              profitPer100: arb.profitPer100,
            }
          });
          fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
          console.log(`[arb-monitor] Auto-alert created for ${arb.spread}¢ spread`);
        }
      }
    }
  }

  saveArbHistory(history);
  return found;
}

// Export for use in server.js
module.exports = { scanArbs, loadArbConfig, saveArbConfig, loadArbHistory };

// If run standalone: scan once then set interval
if (require.main === module) {
  const config = loadArbConfig();
  console.log(`[arb-monitor] Starting — min spread: ${config.minSpread}¢, interval: ${config.checkInterval / 1000}s`);
  scanArbs().then(arbs => {
    console.log(`[arb-monitor] Found ${arbs.length} opportunities`);
  });
  setInterval(() => {
    scanArbs().then(arbs => {
      if (arbs.length) console.log(`[arb-monitor] Scan complete — ${arbs.length} active arbs`);
    });
  }, config.checkInterval);
}