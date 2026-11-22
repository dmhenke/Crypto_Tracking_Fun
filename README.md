# Crypto Tracking Fun

Daily tracking of Bitcoin, Ethereum and Cardano against the Grayscale trusts (GBTC, ETHE), with an interactive dashboard on GitHub Pages.

**Dashboard:** https://dmhenke.github.io/Crypto_Tracking_Fun/

## What it shows

The page uses the same theme as [SolarPergola](https://dmhenke.github.io/SolarPergola/): teal palette; Inter, Spectral and JetBrains Mono fonts; and a system/light/dark toggle. It has five tabs:

- **Overview:** latest prices, and fold change from a reference date you choose (default 2021-01-14, as in the original scripts). Trusts can be shown as total return, with ETHE's distributions reinvested. A table gives each asset's annualized growth.
- **Trusts:** coin fold change minus trust fold change (BTC − GBTC, ETH − ETHE), and a ratio explorer (BTC/GBTC, ETH/ETHE, BTC/ETH, ETH/BTC, ADA/BTC, and trust-vs-Coinbase dollar volume).
- **Prices:** price, volume and drawdown for each asset, with the all-time high, maximum drawdown and 1-year volatility (95% CI).
- **Analysis:** an interactive return-relationship explorer. You pick any two assets, the window (presets or custom dates), the return frequency (daily, weekly or monthly), the confidence level (90, 95 or 99%) and the rolling-window length. The page recomputes in the browser:
  - beta, alpha, correlation, R², volatilities, mean return and tracking error, each with intervals where defined, plus skew, kurtosis and drawdowns
  - a scatter plot with the OLS fit and its confidence band
  - a histogram of returns with a normal fit
  - rolling correlation (with a Fisher-z band) and rolling beta
  - a plain-language reading of the results
- **Cardano:** the current epoch with a countdown and schedule. Epochs last 5 days and roll over at 21:44:51 UTC; epoch 532 began 2025-01-04. You can also drop `Rewards-*.csv` wallet exports onto the page; they are parsed in the browser, never uploaded, and summarized per epoch.

The browser statistics in `docs/assets/js/stats.js` are checked against base R by `Rscript tests/validate_stats.R`, which needs `node`. The two agree to about 1e-9 relative error.

## Data sources (no API keys)

| Asset | Source | Bar |
|---|---|---|
| BTC-USD, ETH-USD, ADA-USD | Coinbase Exchange public candles API | UTC calendar day (complete days only) |
| GBTC, ETHE | Yahoo Finance chart API | NYSE session; `close` unadjusted, `adjclose` includes distributions |

ADA-USD history starts on 2021-03-18, when Coinbase listed it.

## Daily pipeline

`scripts/daily_update.R` uses base R plus `jsonlite`. It is a cleaned-up port of `r_scripts/playing with btc_v2.R` and `r_scripts/Proj_Cardano_Rewards.R`. On each run it:

1. Re-fetches the last 5 stored days of Coinbase candles, so a bar that was still forming is corrected, plus any new days. It re-pulls the full Yahoo history, because Yahoo restates `adjclose` after each distribution.
2. Merges the results into `data/<ASSET>.csv`, one row per date.
3. Writes `docs/data/prices.json` for the dashboard and `docs/data/summary.json` (latest values, statistics, epoch schedule, and data-quality counts).

If one source fails, that asset keeps its stored data and the run continues.

`.github/workflows/daily_update.yml` runs the script at 00:20 UTC every day, commits any data changes, and deploys `docs/` to GitHub Pages. It can also be started from the **Actions** tab.

### Run locally

```bash
Rscript scripts/daily_update.R           # incremental update
Rscript scripts/daily_update.R --full    # rebuild all history from 2021-01-01
cd docs && python3 -m http.server 8000   # then open http://localhost:8000
```

## One-time GitHub setup

1. Push: `git push -u origin main`
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions →** "Daily data update and Pages deploy" **→ Run workflow** for the first deploy.

## Layout

```
.github/workflows/daily_update.yml   daily cron: R pipeline -> commit -> Pages deploy
scripts/daily_update.R               data pipeline
data/*.csv                           stored daily bars
docs/index.html                      dashboard (Plotly), tabbed
docs/assets/css/site.css             theme (ported from SolarPergola) + dashboard styles
docs/assets/js/stats.js              browser statistics library
docs/assets/js/app.js                dashboard logic
docs/data/*.json                     dashboard data, regenerated daily
tests/validate_stats.R               checks stats.js against R (uses tests/stats_dump.js)
r_scripts/                           original exploratory R scripts (reference)
```

Not investment advice.
