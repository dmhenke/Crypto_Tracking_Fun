# Crypto Tracking Fun

Daily tracking of Bitcoin, Ethereum and Cardano against the Grayscale trusts (GBTC, ETHE), with an interactive dashboard on GitHub Pages.

**Dashboard:** https://dmhenke.github.io/Crypto_Tracking_Fun/

## What it shows

- **Fold change from a reference date** (default 2021-01-14, as in the original scripts; adjustable in the page). Trusts can be shown as total return, with ETHE's distributions reinvested.
- **Spread:** coin fold change minus trust fold change (BTC − GBTC, ETH − ETHE).
- **Ratios:** BTC/GBTC, ETH/ETHE, BTC/ETH, ETH/BTC, ADA/BTC, and trust-vs-Coinbase dollar-volume ratios.
- **Prices and volume** for each asset.
- **Return statistics** over the trailing 365 days: beta and correlation of daily log returns, and annualized volatility, each with a 95% confidence interval.
- **Cardano epochs:** the current epoch, a countdown and the schedule. Epochs last 5 days and roll over at 21:44:51 UTC; epoch 532 began 2025-01-04.
- **Staking rewards:** drop `Rewards-*.csv` wallet exports into the page. The files are parsed in the browser and never uploaded.

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
docs/index.html                      dashboard (Plotly)
docs/data/*.json                     dashboard data, regenerated daily
r_scripts/                           original exploratory R scripts (reference)
```

Not investment advice.
