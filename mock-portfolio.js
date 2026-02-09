console.log('🚀 Daylight - Day 2: Portfolio Tracker (Mock Data)\n');
console.log('🔐 Simulating Kalshi connection...\n');
console.log('✅ Connected!\n');

// Mock portfolio data (what it will look like when real API works)
const mockPositions = [
  {
    market_title: 'Will BTC hit $100k in 2025?',
    side: 'YES',
    quantity: 10,
    cost_basis: 4500, // cents
    current_value: 5200 // cents
  },
  {
    market_title: 'Will Fed cut rates in March?',
    side: 'NO',
    quantity: 5,
    cost_basis: 3000,
    current_value: 2800
  },
  {
    market_title: 'Will Trump win 2024 election?',
    side: 'YES',
    quantity: 20,
    cost_basis: 9000,
    current_value: 10500
  }
];

console.log('📊 YOUR PORTFOLIO:\n');
console.log('=====================================');

let totalValue = 0;

mockPositions.forEach((pos, index) => {
  const pnl = pos.current_value - pos.cost_basis;
  const pnlPercent = ((pnl / pos.cost_basis) * 100).toFixed(2);
  
  console.log(`\n${index + 1}. ${pos.market_title}`);
  console.log(`   Position: ${pos.side} (${pos.quantity} contracts)`);
  console.log(`   Cost: $${(pos.cost_basis / 100).toFixed(2)}`);
  console.log(`   Current Value: $${(pos.current_value / 100).toFixed(2)}`);
  console.log(`   P&L: ${pnl >= 0 ? '+' : ''}$${(pnl / 100).toFixed(2)} (${pnlPercent}%)`);
  
  totalValue += pos.current_value;
});

console.log('\n=====================================');
console.log(`💰 Total Portfolio Value: $${(totalValue / 100).toFixed(2)}`);
console.log('=====================================\n');

console.log('🎉 Portfolio tracker working! (Mock data)');
console.log('📝 Next: Replace mock data with real Kalshi API\n');