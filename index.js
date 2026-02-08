require('dotenv').config();
const axios = require('axios');

console.log('🚀 Daylight - Day 1');
console.log('Testing Kalshi API connection...\n');

const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

async function testKalshiConnection() {
  try {
    const response = await axios.get(KALSHI_API + '/markets');
    
    console.log('✅ Connected to Kalshi API');
    console.log('📊 Found', response.data.markets.length, 'markets\n');
    
    console.log('Sample markets:');
    response.data.markets.slice(0, 3).forEach(market => {
      console.log('-', market.title);
      console.log('  Yes:', market.yes_bid + 'cents / No:', market.no_bid + 'cents');
    });
    
    console.log('\n🎉 API working! Day 1 complete.');
    console.log('Tomorrow: Build portfolio tracker\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('Check if Kalshi API is accessible');
  }
}

testKalshiConnection();
