# Crypto Tracking Fun

Daily, interactive analysis of Bitcoin, Ethereum and Cardano on Coinbase against the spot crypto funds: Grayscale's GBTC and ETHE and BlackRock's IBIT and ETHA.

**Dashboard:** https://dmhenke.github.io/Crypto_Tracking_Fun/

The page uses the same theme as [SolarPergola](https://dmhenke.github.io/SolarPergola/), with a system/light/dark toggle. Every statistic is computed in the browser from the daily data and updates as you change the inputs. Every chart has a CSV download button, and every view has a shareable link: the URL records the tab and its settings, e.g. `#analysis?y=ETHE&x=ETH-USD&f=W&ci=H`.

## Tabs

| Tab | What it shows |
|---|---|
| **Overview** | A daily brief written by the pipeline (each move scaled by that asset's own last 90 days, new 52-week highs and lows, epoch rollovers), latest prices, and growth since a reference date (default 2021-01-14, as in the original scripts) with an annualized-return table. |
| **Funds** | Each Grayscale fund's estimated premium or discount to its holdings; the fee drag of GBTC vs IBIT and ETHE vs ETHA, measured from the data with Newey-West intervals and compared with the fee schedules; coin minus fund; and a ratio explorer. |
| **Prices** | Price, volume, total return, the 16:00 ET price and drawdown for any asset, with the all-time high, maximum drawdown and 1-year volatility (95% CI). |
| **Analysis** | Return relationship explorer. You choose two assets, the window, daily/weekly/monthly returns, the confidence level, and the interval method: normal theory, Newey-West or moving-block bootstrap. It also shows a scatter with the OLS band, a return histogram, rolling correlation and beta, lead-lag cross-correlations (UTC close vs. 16:00 ET), day-of-week effects (ANOVA with Bonferroni-adjusted intervals), and drawdowns. |
| **Risk** | A correlation heatmap for any window and set of assets (hover for the 95% CI and n), and rolling 30/60/90-day volatility. |
| **Simulator** | Lump-sum or weekly/monthly purchases into any set of assets, with optional trading cost: invested amount, final value, money-weighted annual return, and worst drop. A hypothetical, not advice. |
| **Forecast** | 80% and 95% price ranges from three simple models (random walk, random walk + trend, EWMA volatility), each scored by a rolling-origin backtest over the whole history: MAE, MAPE and interval coverage with Wilson 95% intervals. |
| **Cardano** | The current epoch with a countdown and schedule (5-day epochs rolling over at 21:44:51 UTC; epoch 532 began 2025-01-04). Drop `Rewards-*.csv` wallet exports to summarize rewards per epoch; files are parsed in the browser and never uploaded. |
| **Data** | Source status and freshness, downloads, the fund fee table with sources, corrections applied to source data, and a glossary. A banner appears on every tab if data are more than two days old or a source failed. |

Event markers (Terra, Celsius, FTX, the Merge, Grayscale's court win, ETF launches, the 2024 halving, the Mini Trust spin-offs, Cardano hard forks, the October 2025 liquidation cascade, Fusaka) can be switched on and off. Dates and sources are in `docs/data/events.json`.

## Data and methods

| Series | Source | Notes |
|---|---|---|
| BTC, ETH, ADA daily | Coinbase Exchange public candles | complete UTC days; ADA from 2021-03-18, its Coinbase listing |
| BTC, ETH at 16:00 ET | Coinbase hourly candles | open of the 16:00 New York hour, to compare with the NYSE close at the same instant |
| GBTC, IBIT, ETHE, ETHA daily | Yahoo Finance chart API | `close` and `adjclose` (distributions reinvested); full history re-pulled daily |

**Fund premium/discount.** The crypto held per share starts from the issuer's published value (GBTC 0.00077105 BTC on 2026-11-20; ETHE 0.00801892 ETH on 2026-10-23). It is rolled back through the fee schedule (GBTC 2.0%, then 1.5% from 2024-01-11; ETHE 2.5%), which accrues daily. The value of the holdings uses the 16:00 ET Coinbase price. Checks:

- The ETF-era median premium is +0.01% for GBTC (IQR 0.08 pp) and −0.03% for ETHE (IQR 0.11 pp), as arbitrage requires.
- The latest GBTC estimate is −0.05%; Grayscale published −0.04%.
- The reconstructed GBTC discount is −24.6% on 2023-08-28 and −17.7% on 2023-08-29, against about −25% and about −17% to −18% reported around the court ruling.

The July 2024 Mini Trust spin-offs (about 10% of each fund's holdings) are already reflected in Yahoo's adjusted history, so they are not applied again.

**Data correction.** Yahoo left ETHE's 2024-07-18 to 07-22 sessions unscaled for the spin-off, which created false −11%/+11% daily moves. The pipeline divides those three days by 0.9. The rule is documented in `config/assets.json` and listed on the Data tab.

**Statistics.** `docs/assets/js/stats.js` implements OLS, Fisher-z correlation intervals, χ² volatility intervals, Newey-West HAC standard errors, a seeded moving-block bootstrap, one-way ANOVA, cross-correlation, and Wilson intervals. `Rscript tests/validate_stats.R` (needs `node`; optionally `sandwich`) checks them against R's `lm`, `confint`, `cor.test`, `t.test`, `anova`, `sandwich::NeweyWest`, `pt`, `pf`, `pbeta`, `qchisq` and `prop.test`. The two agree to better than 1e-8 relative error, and the check runs on every push and before every daily update.

## Pipeline

`scripts/daily_update.R` uses base R plus `jsonlite` and is driven by `config/assets.json`. To track a new asset, add an entry there (Coinbase pair or Yahoo ticker, colors, and for funds the underlying coin and fee schedule); no code changes are needed.

`.github/workflows/daily_update.yml` runs at 00:20 UTC daily in three jobs:

1. Validate the statistics against R.
2. Update the data and commit it. If a source failed or the data are stale, the job opens or comments on a `data-pipeline` issue, and closes it once a later run is clean.
3. Deploy `docs/` to GitHub Pages.

```bash
Rscript scripts/daily_update.R           # incremental update (first run backfills 2021→today, ~3 min)
Rscript scripts/daily_update.R --full    # rebuild everything
Rscript tests/validate_stats.R           # check the browser statistics against R
cd docs && python3 -m http.server 8000   # then open http://localhost:8000
```

**GitHub Pages setup (once):** Settings → Pages → Source: **GitHub Actions**.

## Layout

```
config/assets.json            assets, fee schedules, issuer anchors, data corrections
scripts/daily_update.R        data pipeline
data/*.csv                    stored daily bars (+ *_nyclose.csv at 16:00 ET)
docs/index.html               dashboard shell (Plotly cartesian bundle)
docs/assets/css/site.css      theme (from SolarPergola) + dashboard styles
docs/assets/js/stats.js       statistics library
docs/assets/js/core.js        shared helpers: theming, events, CSV export, URL state
docs/assets/js/tab-*.js       one module per tab; main.js boots the page
docs/data/*.json              prices, funds, summary (regenerated daily), events (curated)
tests/                        stats_dump.js + validate_stats.R
r_scripts/                    original exploratory R scripts
archive/                      retired Prophet forecast (scored poorly; see the Forecast tab)
```

Not investment advice.
