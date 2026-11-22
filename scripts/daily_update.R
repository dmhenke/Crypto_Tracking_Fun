#!/usr/bin/env Rscript
# ==============================================================================
# Crypto_Tracking_Fun :: daily data pipeline
#
# Ported from the original exploratory scripts in r_scripts/:
#   - "playing with btc*.R"     Coinbase daily candles, GBTC/ETHE comparison,
#                               fold change from a reference date, spreads,
#                               BTC/GBTC, BTC/ETH and volume ratios
#   - Proj_Cardano_Rewards.R    5-day Cardano epoch schedule from epoch 532
#
# What it does (run from the repository root):
#   1. Incrementally updates data/<ASSET>.csv with complete daily bars
#        BTC-USD, ETH-USD, ADA-USD  <- Coinbase Exchange public candles API
#        GBTC, ETHE                 <- Yahoo Finance chart API
#      The last few stored days are re-fetched every run so partial or
#      revised bars are corrected.
#   2. Writes docs/data/prices.json  (series consumed by the dashboard)
#            docs/data/summary.json  (latest values, return statistics with
#                                     95% CIs, Cardano epoch schedule)
#
# Dependencies: base R (>= 4.1) + jsonlite. No API keys.
# Usage:  Rscript scripts/daily_update.R            # incremental update
#         Rscript scripts/daily_update.R --full     # rebuild from START_DATE
# ==============================================================================

suppressPackageStartupMessages(library(jsonlite))

# ---- configuration -----------------------------------------------------------
START_DATE   <- as.Date("2021-01-01")
REF_DATE     <- as.Date("2021-01-14")      # reference date used in original scripts
REFRESH_DAYS <- 5                          # re-fetch this many trailing days each run
STATS_DAYS   <- 365                        # window for return statistics
UA           <- "Mozilla/5.0 (Crypto_Tracking_Fun daily pipeline; R)"

ASSETS <- list(
  "BTC-USD" = list(source = "coinbase", label = "Bitcoin (Coinbase)"),
  "ETH-USD" = list(source = "coinbase", label = "Ethereum (Coinbase)"),
  "ADA-USD" = list(source = "coinbase", label = "Cardano (Coinbase)"),
  "GBTC"    = list(source = "yahoo",    label = "Grayscale Bitcoin Trust"),
  "ETHE"    = list(source = "yahoo",    label = "Grayscale Ethereum Trust")
)

# Cardano epoch timing. Shelley-era epochs are exactly 5 days (432000 s) and
# roll over at 21:44:51 UTC; epoch 532 began 2025-01-04 21:44:51 UTC.
# (The original script used 09:45 America/Denver; that is 12 h off but did not
# matter there because it binned by calendar date only.)
EPOCH_REF       <- 532L
EPOCH_REF_START <- as.POSIXct("2025-01-04 21:44:51", tz = "UTC")
EPOCH_SECONDS   <- 5 * 24 * 3600

args      <- commandArgs(trailingOnly = TRUE)
FULL      <- "--full" %in% args
DATA_DIR  <- "data"
OUT_DIR   <- file.path("docs", "data")
dir.create(DATA_DIR, showWarnings = FALSE, recursive = TRUE)
dir.create(OUT_DIR,  showWarnings = FALSE, recursive = TRUE)

log_msg <- function(...) message(format(Sys.time(), "[%Y-%m-%d %H:%M:%S UTC] ", tz = "UTC"), sprintf(...))

# ---- HTTP helper -------------------------------------------------------------
get_json <- function(u, tries = 4, simplify = TRUE) {
  for (i in seq_len(tries)) {
    res <- tryCatch({
      con <- url(u, headers = c("User-Agent" = UA, "Accept" = "application/json"),
                 method = "libcurl")
      txt <- tryCatch(paste(readLines(con, warn = FALSE), collapse = ""),
                      finally = close(con))
      fromJSON(txt, simplifyVector = simplify)
    }, error = function(e) e)
    if (!inherits(res, "error")) return(res)
    log_msg("  request failed (%d/%d): %s", i, tries, conditionMessage(res))
    Sys.sleep(2^i)
  }
  stop("giving up on ", u)
}

# ---- sources -----------------------------------------------------------------
# Coinbase Exchange: max 300 candles per request; rows are
# [time, low, high, open, close, volume] newest first; volume in base currency.
fetch_coinbase <- function(pair, from, to) {
  out <- list()
  s <- from
  while (s <= to) {
    e <- min(s + 299, to)
    u <- sprintf(paste0("https://api.exchange.coinbase.com/products/%s/candles",
                        "?granularity=86400&start=%sT00:00:00Z&end=%sT00:00:00Z"),
                 pair, format(s), format(e))
    m <- get_json(u)
    if (length(m) > 0) {
      m <- matrix(as.numeric(m), ncol = 6)
      out[[length(out) + 1]] <- data.frame(
        date   = as.Date(as.POSIXct(m[, 1], origin = "1970-01-01", tz = "UTC")),
        open   = m[, 4], high = m[, 3], low = m[, 2], close = m[, 5],
        volume = m[, 6])
    }
    s <- e + 1
    Sys.sleep(0.35)                     # stay well under public rate limit
  }
  if (!length(out)) return(NULL)
  df <- do.call(rbind, out)
  df[df$date >= from & df$date <= to, ]
}

# Yahoo Finance chart API; unadjusted OHLC (adjclose kept for reference).
fetch_yahoo <- function(sym, from, to) {
  p1 <- as.numeric(as.POSIXct(from, tz = "UTC"))
  p2 <- as.numeric(as.POSIXct(to + 1, tz = "UTC")) + 86400
  u  <- sprintf(paste0("https://query1.finance.yahoo.com/v8/finance/chart/%s",
                       "?period1=%.0f&period2=%.0f&interval=1d&events=div%%2Csplit"),
                sym, p1, p2)
  j <- get_json(u, simplify = FALSE)
  r <- j$chart$result[[1]]
  if (is.null(r$timestamp)) return(NULL)
  num <- function(x) vapply(x, function(v) if (is.null(v)) NA_real_ else as.numeric(v), 0)
  q  <- r$indicators$quote[[1]]
  ac <- if (!is.null(r$indicators$adjclose)) num(r$indicators$adjclose[[1]]$adjclose) else NA_real_
  ts <- as.POSIXct(num(r$timestamp), origin = "1970-01-01", tz = "UTC")
  df <- data.frame(
    date   = as.Date(format(ts, tz = "America/New_York", "%Y-%m-%d")),
    open   = num(q$open), high = num(q$high), low = num(q$low),
    close  = num(q$close), volume = num(q$volume), adjclose = ac)
  df <- df[!is.na(df$close), ]
  num_cols <- c("open", "high", "low", "close", "adjclose")
  df[num_cols] <- lapply(df[num_cols], round, 4)    # strip float32 noise
  df[!duplicated(df$date, fromLast = TRUE) & df$date >= from & df$date <= to, ]
}

# ---- incremental update ------------------------------------------------------
read_store <- function(path) {
  if (!file.exists(path)) return(NULL)
  d <- read.csv(path, stringsAsFactors = FALSE)
  d$date <- as.Date(d$date)
  d
}

update_asset <- function(sym, cfg) {
  path <- file.path(DATA_DIR, paste0(sym, ".csv"))
  old  <- if (FULL) NULL else read_store(path)
  # crypto: only complete UTC days; equities: up to today (re-fetched next run)
  to   <- if (cfg$source == "coinbase") as.Date(Sys.time(), tz = "UTC") - 1
          else as.Date(Sys.time(), tz = "America/New_York")
  # Yahoo restates adjclose for the whole history whenever a distribution is
  # paid (ETHE pays monthly), so equities are always re-pulled in full (1 request).
  from <- if (is.null(old) || !nrow(old) || cfg$source == "yahoo") START_DATE
          else max(old$date) - REFRESH_DAYS
  log_msg("%s: fetching %s .. %s (%s)", sym, from, to, cfg$source)
  new <- tryCatch(
    if (cfg$source == "coinbase") fetch_coinbase(sym, from, to) else fetch_yahoo(sym, from, to),
    error = function(e) { log_msg("  %s FAILED: %s; keeping stored data", sym, conditionMessage(e)); NULL })
  if (!is.null(new) && nrow(new)) {
    if (!is.null(old)) {
      if (!"adjclose" %in% names(new) && "adjclose" %in% names(old)) new$adjclose <- NA
      if ("adjclose" %in% names(new) && !"adjclose" %in% names(old)) old$adjclose <- NA
      old <- old[!old$date %in% new$date, names(new)]
    }
    d <- rbind(old, new)
  } else d <- old
  if (is.null(d)) stop("no data available for ", sym)
  d <- d[order(d$date), ]
  d <- d[!duplicated(d$date, fromLast = TRUE), ]
  write.csv(d, path, row.names = FALSE)
  log_msg("  %s: %d rows, %s .. %s", sym, nrow(d), min(d$date), max(d$date))
  d
}

dat <- setNames(lapply(names(ASSETS), function(s) update_asset(s, ASSETS[[s]])), names(ASSETS))

# ---- data-quality checks -----------------------------------------------------
gap_days <- function(d, crypto) {
  if (!crypto) return(NA_integer_)        # equities skip weekends/holidays
  full <- seq(min(d$date), max(d$date), by = "day")
  length(setdiff(full, d$date))
}
qc <- lapply(names(dat), function(s) {
  d <- dat[[s]]
  list(rows = nrow(d), first = format(min(d$date)), last = format(max(d$date)),
       missing_calendar_days = gap_days(d, ASSETS[[s]]$source == "coinbase"),
       nonpositive_close = sum(d$close <= 0, na.rm = TRUE))
})
names(qc) <- names(dat)

# ---- analytics (summary; the dashboard recomputes interactively) --------------
last_close <- function(d, on) { i <- which(d$date <= on); if (length(i)) d$close[max(i)] else NA }
pct_change <- function(d, days) {
  l <- max(d$date); 100 * (last_close(d, l) / last_close(d, l - days) - 1)
}
latest <- lapply(names(dat), function(s) {
  d <- dat[[s]]
  list(label = ASSETS[[s]]$label, date = format(max(d$date)), close = tail(d$close, 1),
       chg_1d = pct_change(d, 1), chg_7d = pct_change(d, 7), chg_30d = pct_change(d, 30),
       chg_365d = pct_change(d, 365),
       fold_from_ref = last_close(d, max(d$date)) / last_close(d, REF_DATE))
})
names(latest) <- names(dat)

# Daily log-return relationships over the trailing window, matched on common
# dates. Returns are close to serially uncorrelated, so OLS/Pearson CIs are a
# reasonable approximation; heavy tails make them somewhat optimistic.
# Note: Coinbase daily bars close at 00:00 UTC, NYSE at 16:00 ET, so same-date
# returns are offset by 3-4 h; weekend crypto moves land on Monday for GBTC/ETHE.
pair_stats <- function(y, x) {
  a <- dat[[y]]; b <- dat[[x]]
  m <- merge(a[, c("date", "close")], b[, c("date", "close")], by = "date", suffixes = c(".y", ".x"))
  m <- m[m$date > max(m$date) - STATS_DAYS, ]
  ry <- diff(log(m$close.y)); rx <- diff(log(m$close.x))
  fit <- lm(ry ~ rx); ci <- confint(fit)["rx", ]
  ct  <- cor.test(ry, rx)
  k   <- if (ASSETS[[y]]$source == "yahoo" || ASSETS[[x]]$source == "yahoo") 252 else 365
  list(y = y, x = x, n = length(ry), from = format(min(m$date)), to = format(max(m$date)),
       beta = unname(coef(fit)["rx"]), beta_lo = unname(ci[1]), beta_hi = unname(ci[2]),
       r = unname(ct$estimate), r_lo = ct$conf.int[1], r_hi = ct$conf.int[2],
       vol_y = sd(ry) * sqrt(k), vol_x = sd(rx) * sqrt(k))
}
stats <- list(pair_stats("GBTC", "BTC-USD"), pair_stats("ETHE", "ETH-USD"),
              pair_stats("ETH-USD", "BTC-USD"), pair_stats("ADA-USD", "BTC-USD"))

# Annualized volatility (365-day basis for crypto, 252 for equities) with a
# chi-square 95% CI on the daily SD.
vol_ci <- function(s) {
  d <- dat[[s]]; d <- d[d$date > max(d$date) - STATS_DAYS, ]
  r <- diff(log(d$close)); n <- length(r); k <- if (ASSETS[[s]]$source == "coinbase") 365 else 252
  sdv <- sd(r)
  list(asset = s, n = n, ann_vol = sdv * sqrt(k),
       lo = sqrt((n - 1) * sdv^2 / qchisq(0.975, n - 1)) * sqrt(k),
       hi = sqrt((n - 1) * sdv^2 / qchisq(0.025, n - 1)) * sqrt(k))
}
vols <- lapply(names(dat), vol_ci)

# ---- Cardano epochs ----------------------------------------------------------
now_utc   <- Sys.time()
cur_epoch <- EPOCH_REF + floor(as.numeric(difftime(now_utc, EPOCH_REF_START, units = "secs")) / EPOCH_SECONDS)
ep_start  <- function(e) EPOCH_REF_START + (e - EPOCH_REF) * EPOCH_SECONDS
fmt_utc   <- function(t) format(t, "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
epochs <- list(reference_epoch = EPOCH_REF, reference_start_utc = fmt_utc(EPOCH_REF_START),
               epoch_seconds = EPOCH_SECONDS, current_epoch = cur_epoch,
               current_start_utc = fmt_utc(ep_start(cur_epoch)),
               next_start_utc = fmt_utc(ep_start(cur_epoch + 1)))

# ---- write outputs -----------------------------------------------------------
series <- lapply(names(dat), function(s) {
  d <- dat[[s]]
  o <- list(label = ASSETS[[s]]$label, source = ASSETS[[s]]$source,
            date = format(d$date), close = signif(d$close, 8), volume = round(d$volume, 2))
  if ("adjclose" %in% names(d)) o$adjclose <- signif(d$adjclose, 8)   # total return incl. distributions
  o
})
names(series) <- names(dat)
generated <- fmt_utc(now_utc)
write_json(list(generated_utc = generated, ref_date = format(REF_DATE), assets = series),
           file.path(OUT_DIR, "prices.json"), auto_unbox = TRUE, digits = NA)
write_json(list(generated_utc = generated, ref_date = format(REF_DATE), latest = latest,
                return_stats = stats, volatility = vols, epochs = epochs, qc = qc,
                sources = list(coinbase = "https://api.exchange.coinbase.com (public candles)",
                               yahoo = "https://query1.finance.yahoo.com/v8/finance/chart")),
           file.path(OUT_DIR, "summary.json"), auto_unbox = TRUE, digits = 8, pretty = TRUE)
log_msg("done: wrote %s and %s", file.path(OUT_DIR, "prices.json"), file.path(OUT_DIR, "summary.json"))
