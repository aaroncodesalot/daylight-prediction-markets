// index.js - Daylight CLI (Day 4)
require('dotenv').config();
const readline = require('readline');
const { createAlert, listAlerts, checkAlerts, clearAlerts, showMarkets } = require('./alerts');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

function showMenu() {
  console.log('\n🔆 Daylight - Prediction Market Tools');
  console.log('─'.repeat(40));
  console.log('1. View markets');
  console.log('2. Set alert');
  console.log('3. View alerts');
  console.log('4. Check alerts');
  console.log('5. Clear alerts');
  console.log('6. Test Kalshi API');
  console.log('0. Exit\n');
}

async function setAlert() {
  showMarkets();
  const marketId = await ask('\nMarket ID: ');
  const condition = await ask('Condition (above/below): ');
  const target = await ask('Target price (¢): ');
  createAlert(marketId, condition, target);
}

async function testKalshi() {
  const axios = require('axios');
  const API = 'https://api.elections.kalshi.com/trade-api/v2';
  try {
    const res = await axios.get(API + '/markets');
    console.log('\n✅ Connected to Kalshi API');
    console.log(`📊 Found ${res.data.markets.length} markets`);
    res.data.markets.slice(0, 3).forEach(m => {
      console.log(`- ${m.title}`);
      console.log(`  Yes: ${m.yes_bid}¢ / No: ${m.no_bid}¢`);
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

async function main() {
  showMenu();
  while (true) {
    const choice = await ask('> ');
    switch (choice) {
      case '1': showMarkets(); break;
      case '2': await setAlert(); break;
      case '3': listAlerts(); break;
      case '4': checkAlerts(); break;
      case '5': clearAlerts(); break;
      case '6': await testKalshi(); break;
      case '0': console.log('\n👋 Later.\n'); rl.close(); process.exit(0);
      default: showMenu();
    }
  }
}

main();