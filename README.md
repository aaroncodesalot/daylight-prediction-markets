**# ☀️ Daylight — Prediction Market Intelligence Platform**



**\*\*Real-time arbitrage detection and market monitoring across Kalshi and Polymarket.\*\***



**🔴 \*\*Live Demo:\*\* \[daylight-prediction-markets.onrender.com](https://daylight-prediction-markets.onrender.com)**



**Built solo in 21 days — from first commit to production deployment.**



---



**## What It Does**



Daylight monitors prediction markets across two major platforms (Kalshi and Polymarket) in real time, identifying price discrepancies and arbitrage opportunities that traders can act on.



\- \*\*Cross-platform arbitrage detection\*\* — Finds the same markets listed on both Kalshi and Polymarket, calculates price spreads, and surfaces profitable discrepancies

\- \*\*Live market data\*\* — Pulls real-time pricing from Kalshi's Trade API and Polymarket's Gamma API

\- \*\*Price movement tracking\*\* — Sparkline charts and delta indicators show how prices are moving between refreshes

\- \*\*Top movers feed\*\* — Highlights the markets with the largest price swings across both platforms

\- \*\*Watchlist\*\* — Star any market for quick tracking with live price updates

\- \*\*Alert system\*\* — Set price threshold alerts on any market (above/below triggers)

\- \*\*Portfolio tracking\*\* — Connects to Kalshi's authenticated API for live position tracking (falls back to mock data without credentials)

\- \*\*Market detail pages\*\* — Individual pages for every market with full pricing, volume, open interest, and direct links to trade



**## Tech Stack**



| Layer | Technology |

|-------|-----------|

| Runtime | Node.js (vanilla JavaScript) |

| Server | Express.js |

| APIs | Kalshi Trade API v2, Polymarket Gamma API |

| Auth | RSA-PSS signed requests (Kalshi portfolio) |

| Frontend | Server-rendered HTML, CSS custom properties, inline SVG sparklines |

| Deployment | Render (free tier) |

| Version Control | Git, GitHub |



\*\*Zero frameworks. Zero build tools. Zero dependencies beyond Express and Axios.\*\* The entire frontend is server-rendered in a single `res.send()` call — no React, no Webpack, no transpilation step.



**## Architecture**

```

server.js          → Express app, API routes, SSR dashboard (main entry)

arb-monitor.js     → Background arbitrage scanner (configurable intervals)

alerts.js          → Alert persistence and trigger logic

market-explorer.js → Market browsing utilities

mock-portfolio.js  → Fallback portfolio data for demo mode

```



**Key design decisions:**



\- \*\*Single-file server architecture\*\* — Entire web app in one file for rapid iteration. No premature abstraction.

\- \*\*Mock-first development\*\* — Built complete UI with mock data before integrating real APIs. Unblocked frontend work while solving API auth.

\- \*\*Server-side rendering\*\* — No client-side framework. HTML generated on each request with fresh API data. Eliminates an entire class of state management complexity.

\- \*\*Graceful degradation\*\* — If Kalshi is down, Polymarket still loads. If auth isn't configured, mock portfolio appears. Nothing crashes.



**## Features in Detail**



\### Arbitrage Detection

The similarity matching algorithm normalizes market titles from both platforms, tokenizes them, and calculates overlap ratios. Markets with ≥40% word similarity and ≥2¢ price spread are flagged as arbitrage opportunities with directional trade recommendations.



**### Sparkline Charts**

Inline SVG sparklines generated server-side from a rolling price history cache. Each market gets a 20-point price history that persists across refreshes, with color-coded up/down indicators.



**### Keyboard Shortcuts**

Vim-inspired navigation: `/` to search, `j`/`k` to scroll, `R` to refresh, `T` to toggle dark/light theme, `G` to jump to top, `?` for help overlay.



**## Development Timeline**



| Day | Milestone |

|-----|-----------|

| 1 | Project structure + Kalshi API integration test |

| 2 | Portfolio tracker UI (mock data) |

| 3 | Market explorer |

| 4 | Alert system + CLI menu |

| 5-10 | Alert triggers, persistence, refinement |

| 11-15 | Web UI (Express server, SSR dashboard) |

| 16-21 | Arb monitor, Polymarket integration, sparklines, keyboard shortcuts, theme system |

| 22 | Production deployment to Render |



**\*\*Approach:\*\*** Ship daily. Mock data first, real APIs second, production third. Git commit after every feature.



**## Running Locally**

```bash

git clone https://github.com/aaroncodesalot/daylight-prediction-markets.git

cd daylight-prediction-markets

npm install

node server.js

\# Open http://localhost:3000

```



**Optional `.env` for authenticated Kalshi portfolio access:**

```

KALSHI\_API\_KEY\_ID=your-api-key-id

KALSHI\_PRIVATE\_KEY\_PATH=./kalshi-key.pem

```



Without credentials, the dashboard runs in demo mode with mock portfolio data. All market data and arbitrage features work without authentication.



**## What I'd Build Next**



\- WebSocket streaming for real-time price updates (replacing 60s polling)

\- Historical arbitrage performance tracking and win rate analytics

\- Push notifications when high-spread arbs appear

\- Multi-market correlation analysis

\- API endpoint layer for programmatic access to arb data



**## About**



**Built by \[Aaron](https://github.com/aaroncodesalot)** — full-stack engineer focused on shipping fast and iterating in production. Background in API integration, real-time data systems, and building tools that solve real problems.



**\*\*Open to freelance/contract work and full-time opportunities.\*\*** Especially interested in roles involving real-time data, API architecture, AI/ML integration, or fintech.



**📧 Reach out via \[GitHub](https://github.com/aaroncodesalot)**

