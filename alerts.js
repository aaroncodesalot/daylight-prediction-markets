// alerts.js - Day 4: Alert system (mock data)
const fs = require('fs');
const ALERTS_FILE = './alerts.json';

function loadAlerts() {
  try { return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8')); }
  catch { return []; }
}

function saveAlerts(alerts) {
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
}

const MOCK_PRICES = {
  'btc-100k':      { name: 'BTC above $100k by Dec',     price: 52 },
  'trump-win':     { name: 'Trump wins 2024',            price: 61 },
  'fed-rate-cut':  { name: 'Fed cuts rates June',        price: 45 },
  'sp500-ath':     { name: 'S&P 500 new ATH by March',   price: 70 },
  'eth-5k':        { name: 'ETH above $5k by Dec',       price: 28 },
  'recession-2025':{ name: 'US recession by 2025',       price: 18 },
  'ai-regulation': { name: 'Major AI regulation passed',  price: 35 },
  'tiktok-ban':    { name: 'TikTok banned in US',        price: 42 },
};

function createAlert(marketId, condition, targetPrice) {
  const market = MOCK_PRICES[marketId];
  if (!market) { console.log('❌ Unknown market ID.'); return; }
  const alerts = loadAlerts();
  alerts.push({
    id: `alert-${Date.now()}`,
    marketId,
    marketName: market.name,
    condition,
    targetPrice: parseInt(targetPrice),
    triggered: false,
    createdAt: new Date().toISOString()
  });
  saveAlerts(alerts);
  console.log(`\n✅ Alert set: "${market.name}" ${condition} ${targetPrice}¢`);
}

function listAlerts() {
  const alerts = loadAlerts();
  if (!alerts.length) { console.log('\n📭 No alerts set.'); return; }
  console.log(`\n🚨 Your Alerts (${alerts.length}):`);
  console.log('─'.repeat(50));
  alerts.forEach((a, i) => {
    const status = a.triggered ? '🔔 TRIGGERED' : '⏳ watching';
    console.log(`${i + 1}. ${a.marketName} | ${a.condition} ${a.targetPrice}¢ | ${status}`);
  });
}

function checkAlerts() {
  const alerts = loadAlerts();
  let triggered = 0;
  console.log('\n🔍 Checking alerts...\n');
  alerts.forEach(alert => {
    if (alert.triggered) return;
    const market = MOCK_PRICES[alert.marketId];
    if (!market) return;
    const hit = (alert.condition === 'above' && market.price >= alert.targetPrice) ||
                (alert.condition === 'below' && market.price <= alert.targetPrice);
    if (hit) {
      alert.triggered = true;
      triggered++;
      console.log(`🔔 TRIGGERED: "${market.name}" is ${market.price}¢ (target: ${alert.condition} ${alert.targetPrice}¢)`);
    }
  });
  if (!triggered) console.log('😴 No alerts triggered.');
  saveAlerts(alerts);
}

function clearAlerts() {
  saveAlerts([]);
  console.log('\n🗑️  All alerts cleared.');
}

function showMarkets() {
  console.log('\n📊 Available Markets:');
  console.log('─'.repeat(50));
  Object.entries(MOCK_PRICES).forEach(([id, m]) => {
    console.log(`  ${id.padEnd(18)} ${m.name.padEnd(30)} ${m.price}¢`);
  });
}

module.exports = { createAlert, listAlerts, checkAlerts, clearAlerts, showMarkets, loadAlerts, MOCK_PRICES };