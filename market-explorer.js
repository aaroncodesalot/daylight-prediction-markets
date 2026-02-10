console.log('🚀 Daylight - Day 3: Market Explorer\n');
console.log('🔍 Fetching available markets...\n');

// Mock market data (what it will look like when real API works)
const mockMarkets = [
  {
    title: 'Will BTC hit $100k in 2025?',
    category: 'Crypto',
    yes_price: 45,
    no_price: 55,
    volume_24h: 12500,
    total_traders: 234
  },
  {
    title: 'Will Fed cut rates in March 2025?',
    category: 'Economics',
    yes_price: 28,
    no_price: 72,
    volume_24h: 8200,
    total_traders: 156
  },
  {
    title: 'Will Trump win 2024 election?',
    category: 'Politics',
    yes_price: 52,
    no_price: 48,
    volume_24h: 45800,
    total_traders: 892
  },
  {
    title: 'Will Apple release Vision Pro 2 in 2025?',
    category: 'Tech',
    yes_price: 67,
    no_price: 33,
    volume_24h: 5400,
    total_traders: 78
  },
  {
    title: 'Will Lakers make playoffs this season?',
    category: 'Sports',
    yes_price: 81,
    no_price: 19,
    volume_24h: 3200,
    total_traders: 145
  },
  {
    title: 'Will inflation exceed 3% in Q1 2025?',
    category: 'Economics',
    yes_price: 62,
    no_price: 38,
    volume_24h: 15600,
    total_traders: 267
  },
  {
    title: 'Will OpenAI release GPT-5 in 2025?',
    category: 'Tech',
    yes_price: 34,
    no_price: 66,
    volume_24h: 9800,
    total_traders: 189
  },
  {
    title: 'Will SpaceX launch Starship to orbit in Q1?',
    category: 'Space',
    yes_price: 73,
    no_price: 27,
    volume_24h: 7200,
    total_traders: 134
  }
];

console.log('✅ Found', mockMarkets.length, 'active markets\n');

// Sort by volume (most active first)
const sortedMarkets = [...mockMarkets].sort((a, b) => b.volume_24h - a.volume_24h);

console.log('📊 MARKET EXPLORER (Sorted by Volume):\n');
console.log('='.repeat(80));

sortedMarkets.forEach((market, index) => {
  const volumeK = (market.volume_24h / 1000).toFixed(1);
  
  console.log(`\n${index + 1}. ${market.title}`);
  console.log(`   Category: ${market.category}`);
  console.log(`   YES: ${market.yes_price}¢ | NO: ${market.no_price}¢`);
  console.log(`   Volume (24h): $${volumeK}k | Traders: ${market.total_traders}`);
});

console.log('\n' + '='.repeat(80));
console.log(`\n💡 Showing ${sortedMarkets.length} markets`);
console.log('🎯 Markets sorted by trading volume (most active first)\n');

console.log('🎉 Market explorer working!');
console.log('📝 Next: Add filtering by category\n');