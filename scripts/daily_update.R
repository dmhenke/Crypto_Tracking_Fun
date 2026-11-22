#!/usr/bin/env Rscript
# ==============================================================================
# Crypto_Tracking_Fun :: daily data pipeline (base R + jsonlite)
#
# Ported from r_scripts/ ("playing with btc*.R", Proj_Cardano_Rewards.R).
# Driven by config/assets.json: add an asset there and it flows through to the
# dashboard without code changes.
#
#   1. Daily bars          data/<SYMBOL>.csv
#        coins  <- Coinbase Exchange public candles (complete UTC days)
#        funds  <- Yahoo Finance chart API (full history re-pulled each run)
#   2. NYSE-close prices   data/<SYMBOL>_nyclose.csv
#        Coinbase price at 16:00 America/New_York (open of the 16:00 hourly
#        candle), so coins can be compared with funds at the same instant.
#   3. Fund NAV estimates  units of coin per share from the issuer's published
#        anchor, rolled back through the fee schedule; premium = price/NAV - 1.
#   4. Outputs             docs/data/prices.json   series + asset metadata
#                          docs/data/funds.json    NAV / premium estimates
#                          docs/data/summary.json  latest values, daily brief,
#                                                  source status, QC, epochs
#
# Usage: Rscript scripts/daily_update.R [--full]
# ==============================================================================
suppressPackageStartupMessages(library(jsonlite))

CFG          <- fromJSON("config/assets.json", simplifyVector = FALSE)
START_DATE   <- as.Date(CFG$start_date)
REF_DATE     <- as.Date(CFG$reference_date)
REFRESH_DAYS <- 5
UA           <- "Mozilla/5.0 (Crypto_Tracking_Fun daily pipeline; R)"
FULL         <- "--full" %in% commandArgs(trailingOnly = TRUE)
DATA_DIR     <- "data"; OUT_DIR <- file.path("docs", "data")
dir.create(DATA_DIR, FALSE, TRUE); dir.create(OUT_DIR, FALSE, TRUE)

ASSETS <- setNames(CFG$assets, vapply(CFG$assets, `[[`, "", "symbol"))

EPOCH_REF <- 532L; EPOCH_REF_START <- as.POSIXct("2025-01-04 21:44:51", tz = "UTC"); EPOCH_SECONDS <- 432000

log_msg <- function(...) message(format(Sys.time(), "[%Y-%m-%d %H:%M:%S UTC] ", tz = "UTC"), sprintf(...))
fmt_utc <- function(t) format(t, "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
`%||%`  <- function(a, b) if (is.null(a)) b else a

# ---- HTTP ----------------------------------------------------------------------
get_json <- function(u, tries = 4, simplify = TRUE) {
  for (i in seq_len(tries)) {
    res <- tryCatch({
      con <- url(u, headers = c("User-Agent" = UA, "Accept" = "application/json"), method = "libcurl")
      txt <- tryCatch(paste(readLines(con, warn = FALSE), collapse = ""), finally = close(con))
      fromJSON(txt, simplifyVector = simplify)
    }, error = function(e) e)
    if (!inherits(res, "error")) return(res)
    log_msg("  request failed (%d/%d): %s", i, tries, conditionMessage(res))
    Sys.sleep(2^i)
  }
  stop("giving up on ", u)
}

# ---- sources -------------------------------------------------------------------
cb_candles <- function(pair, start, end, gran) {
  u <- sprintf("https://api.exchange.coinbase.com/products/%s/candles?granularity=%d&start=%s&end=%s",
               pair, gran, fmt_utc(start), fmt_utc(end))
  m <- get_json(u)
  if (!length(m)) return(NULL)
  m <- matrix(as.numeric(m), ncol = 6)   # time, low, high, open, close, volume
  data.frame(time = as.POSIXct(m[, 1], origin = "1970-01-01", tz = "UTC"),
             low = m[, 2], high = m[, 3], open = m[, 4], close = m[, 5], volume = m[, 6])
}
fetch_coinbase <- function(pair, from, to) {
  out <- list(); s <- from
  while (s <= to) {
    e <- min(s + 299, to)
    d <- cb_candles(pair, as.POSIXct(s, tz = "UTC"), as.POSIXct(e, tz = "UTC"), 86400)
    if (!is.null(d)) out[[length(out) + 1]] <- data.frame(date = as.Date(d$time), open = d$open, high = d$high,
                                                          low = d$low, close = d$close, volume = d$volume)
    s <- e + 1; Sys.sleep(0.35)
  }
  if (!length(out)) return(NULL)
  df <- do.call(rbind, out); df[df$date >= from & df$date <= to, ]
}
# Price at 16:00 New York time: open of the hourly candle that starts then.
fetch_coinbase_nyclose <- function(pair, from, to) {
  out <- list(); s <- as.POSIXct(from, tz = "UTC"); stop_t <- as.POSIXct(to + 1, tz = "UTC")
  while (s < stop_t) {
    e <- min(s + 299 * 3600, stop_t)
    d <- cb_candles(pair, s, e, 3600)
    if (!is.null(d)) {
      ny <- format(d$time, "%H:%M", tz = "America/New_York")
      k  <- d[ny == "16:00", ]
      if (nrow(k)) out[[length(out) + 1]] <- data.frame(date = as.Date(format(k$time, "%Y-%m-%d", tz = "America/New_York")), price = k$open)
    }
    s <- e + 3600; Sys.sleep(0.35)
  }
  if (!length(out)) return(NULL)
  df <- do.call(rbind, out); df <- df[!duplicated(df$date), ]; df[df$date >= from & df$date <= to, ]
}
fetch_yahoo <- function(sym, from, to) {
  u <- sprintf(paste0("https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=%.0f&period2=%.0f",
                      "&interval=1d&events=div%%2Csplit"),
               sym, as.numeric(as.POSIXct(from, tz = "UTC")), as.numeric(as.POSIXct(to + 2, tz = "UTC")))
  j <- get_json(u, simplify = FALSE); r <- j$chart$result[[1]]
  if (is.null(r$timestamp)) return(NULL)
  num <- function(x) vapply(x, function(v) if (is.null(v)) NA_real_ else as.numeric(v), 0)
  q  <- r$indicators$quote[[1]]
  ac <- if (!is.null(r$indicators$adjclose)) num(r$indicators$adjclose[[1]]$adjclose) else NA_real_
  ts <- as.POSIXct(num(r$timestamp), origin = "1970-01-01", tz = "UTC")
  df <- data.frame(date = as.Date(format(ts, "%Y-%m-%d", tz = "America/New_York")),
                   open = num(q$open), high = num(q$high), low = num(q$low), close = num(q$close),
                   volume = num(q$volume), adjclose = ac)
  df <- df[!is.na(df$close), ]
  cols <- c("open", "high", "low", "close", "adjclose"); df[cols] <- lapply(df[cols], round, 4)
  df[!duplicated(df$date, fromLast = TRUE) & df$date >= from & df$date <= to, ]
}

# ---- incremental store -------------------------------------------------------------
read_store <- function(path) { if (!file.exists(path)) return(NULL); d <- read.csv(path, stringsAsFactors = FALSE); d$date <- as.Date(d$date); d }
merge_store <- function(old, new) {
  if (is.null(new) || !nrow(new)) return(old)
  if (!is.null(old)) {
    for (cc in setdiff(names(new), names(old))) old[[cc]] <- NA
    for (cc in setdiff(names(old), names(new))) new[[cc]] <- NA
    old <- old[!old$date %in% new$date, names(new)]
  }
  d <- rbind(old, new); d <- d[order(d$date), ]; d[!duplicated(d$date, fromLast = TRUE), ]
}
STATUS <- list()
update_asset <- function(a) {
  sym <- a$symbol; path <- file.path(DATA_DIR, paste0(sym, ".csv"))
  old <- if (FULL) NULL else read_store(path)
  coin <- a$source == "coinbase"
  to   <- if (coin) as.Date(Sys.time(), tz = "UTC") - 1 else as.Date(Sys.time(), tz = "America/New_York")
  from <- if (is.null(old) || !coin) START_DATE else max(old$date) - REFRESH_DAYS
  log_msg("%s: %s .. %s (%s)", sym, from, to, a$source)
  new <- tryCatch(if (coin) fetch_coinbase(sym, from, to) else fetch_yahoo(sym, from, to),
                  error = function(e) { STATUS[[sym]] <<- list(ok = FALSE, message = conditionMessage(e)); NULL })
  # every request covers >= 5 days, so 0 rows is a failed source, not a quiet day
  if (is.null(STATUS[[sym]])) STATUS[[sym]] <<- if (is.null(new) || !nrow(new)) list(ok = FALSE, message = "0 rows fetched") else list(ok = TRUE, message = sprintf("%d rows fetched", nrow(new)))
  # documented source-data corrections, applied to freshly fetched rows only (never twice)
  if (!is.null(new)) for (fx in CFG$data_fixes) if (fx$symbol == sym) {
    k <- new$date >= as.Date(fx$from) & new$date <= as.Date(fx$to)
    for (cc in intersect(c("open", "high", "low", "close", "adjclose"), names(new))) new[[cc]][k] <- round(new[[cc]][k] / fx$divide_by, 4)
  }
  d <- merge_store(old, new)
  if (is.null(d)) stop("no data at all for ", sym)
  write.csv(d, path, row.names = FALSE)
  log_msg("  %s: %d rows, %s .. %s", sym, nrow(d), min(d$date), max(d$date)); d
}
update_nyclose <- function(a) {
  sym <- a$symbol; path <- file.path(DATA_DIR, paste0(sym, "_nyclose.csv"))
  old <- if (FULL) NULL else read_store(path)
  to  <- as.Date(Sys.time(), tz = "America/New_York")
  from <- if (is.null(old)) START_DATE else max(old$date) - 3
  log_msg("%s 16:00 ET: %s .. %s", sym, from, to)
  new <- tryCatch(fetch_coinbase_nyclose(sym, from, to), error = function(e) {
    STATUS[[paste0(sym, " 16:00 ET")]] <<- list(ok = FALSE, message = conditionMessage(e)); NULL })
  k <- paste0(sym, " 16:00 ET")
  if (is.null(STATUS[[k]])) STATUS[[k]] <<- if (is.null(new) || !nrow(new)) list(ok = FALSE, message = "0 rows fetched") else list(ok = TRUE, message = sprintf("%d rows fetched", nrow(new)))
  d <- merge_store(old, new); if (!is.null(d)) write.csv(d, path, row.names = FALSE); d
}

dat <- lapply(ASSETS, update_asset)
nyc <- list()
for (a in ASSETS) if (isTRUE(a$nyse_close)) nyc[[a$symbol]] <- update_nyclose(a)

# ---- fund NAV and premium -------------------------------------------------------------
# Units of the coin per share decline daily by fee/365 (fees accrue daily on NAV).
# Roll the issuer's published anchor backward/forward through the fee schedule.
# Spin-offs are NOT applied: Yahoo's history is already scaled for them (see
# README); the ETF-era premium (~0 by arbitrage) is the check on this choice.
units_per_share <- function(a, dates) {
  fees <- do.call(rbind, lapply(a$fees, function(f) data.frame(from = as.Date(f$from), rate = f$rate)))
  fee_on <- function(d) fees$rate[findInterval(as.numeric(d), as.numeric(fees$from))]
  all_d <- seq(min(dates, as.Date(a$anchor$date)), max(dates, as.Date(a$anchor$date)), by = "day")
  logu  <- cumsum(c(0, log(1 - fee_on(all_d[-1]) / 365)))             # relative to first day
  logu  <- logu - logu[match(as.Date(a$anchor$date), all_d)] + log(a$anchor$units_per_share)
  exp(logu[match(dates, all_d)])
}
funds <- list()
for (a in ASSETS) if (!is.null(a$anchor) && !is.null(nyc[[a$underlying]])) {
  f <- dat[[a$symbol]]; p <- nyc[[a$underlying]]
  m <- merge(f[, c("date", "close")], p, by = "date")
  m$units <- units_per_share(a, m$date); m$nav <- m$units * m$price; m$premium <- m$close / m$nav - 1
  etf <- m$date >= as.Date(a$etf_since)
  funds[[a$symbol]] <- list(
    underlying = a$underlying, anchor = a$anchor, etf_since = a$etf_since, fees = a$fees, spinoffs = a$spinoffs,
    date = format(m$date), units = signif(m$units, 8), nav = round(m$nav, 4), premium = round(m$premium, 5),
    check = list(etf_era_median_premium = median(m$premium[etf]), etf_era_iqr = unname(diff(quantile(m$premium[etf], c(.25, .75)))),
                 n_etf_days = sum(etf)))
  log_msg("%s premium: latest %.2f%%, ETF-era median %.2f%% (IQR %.2f pp)", a$symbol, 100 * tail(m$premium, 1),
          100 * median(m$premium[etf]), 100 * diff(quantile(m$premium[etf], c(.25, .75))))
}

# ---- latest values and daily brief ---------------------------------------------------------
last_on <- function(d, on) { i <- which(d$date <= on); if (length(i)) d$close[max(i)] else NA }
latest <- lapply(dat, function(d) {
  l <- max(d$date); ch <- function(k) 100 * (last_on(d, l) / last_on(d, l - k) - 1)
  list(date = format(l), close = tail(d$close, 1), chg_1d = ch(1), chg_7d = ch(7), chg_30d = ch(30), chg_365d = ch(365))
})
brief <- list()
for (s in names(dat)) {
  d <- dat[[s]]; n <- nrow(d); a <- ASSETS[[s]]
  r <- diff(log(d$close)); last_r <- tail(r, 1); hist_r <- head(tail(r, 91), 90)
  z <- last_r / sd(hist_r)
  y1 <- d[d$date > max(d$date) - 365, ]
  hi52 <- tail(d$close, 1) >= max(y1$close); lo52 <- tail(d$close, 1) <= min(y1$close)
  dd <- tail(d$close, 1) / max(d$close) - 1
  sev <- if (abs(z) >= 3) 3 else if (abs(z) >= 2 || hi52 || lo52) 2 else 1
  txt <- sprintf("%s %s %.1f%% on %s, %.1f standard deviations of its last 90 daily moves.",
                 a$short, if (last_r >= 0) "rose" else "fell", 100 * abs(exp(last_r) - 1), format(max(d$date)), abs(z))
  if (hi52) txt <- paste(txt, "That is a new 52-week high.")
  if (lo52) txt <- paste(txt, "That is a new 52-week low.")
  brief[[length(brief) + 1]] <- list(asset = s, severity = sev, z = z, ret = exp(last_r) - 1, hi52 = hi52, lo52 = lo52,
                                     drawdown = dd, text = txt)
}
brief <- brief[order(-vapply(brief, function(b) abs(b$z), 0))]
for (s in names(funds)) {
  pr <- tail(funds[[s]]$premium, 1)
  if (abs(pr) > 0.005) brief[[length(brief) + 1]] <- list(asset = s, severity = 2, text =
    sprintf("%s closed at an estimated %+.2f%% %s to its holdings, outside the usual ETF band.", s, 100 * pr, if (pr > 0) "premium" else "discount"))
}
now_utc   <- Sys.time()
cur_epoch <- EPOCH_REF + floor(as.numeric(difftime(now_utc, EPOCH_REF_START, units = "secs")) / EPOCH_SECONDS)
ep_start  <- function(e) EPOCH_REF_START + (e - EPOCH_REF) * EPOCH_SECONDS
if (as.numeric(difftime(now_utc, ep_start(cur_epoch), units = "hours")) < 24)
  brief[[length(brief) + 1]] <- list(asset = "ADA-USD", severity = 1,
    text = sprintf("Cardano epoch %d began %s.", cur_epoch, format(ep_start(cur_epoch), "%Y-%m-%d %H:%M UTC", tz = "UTC")))

# ---- QC ------------------------------------------------------------------------------------
qc <- lapply(names(dat), function(s) {
  d <- dat[[s]]; coin <- ASSETS[[s]]$source == "coinbase"
  list(rows = nrow(d), first = format(min(d$date)), last = format(max(d$date)),
       missing_calendar_days = if (coin) length(setdiff(seq(min(d$date), max(d$date), "day"), d$date)) else NA,
       nonpositive_close = sum(d$close <= 0, na.rm = TRUE),
       largest_abs_daily_logret = max(abs(diff(log(d$close)))))
}); names(qc) <- names(dat)

# ---- outputs -------------------------------------------------------------------------------
meta_of <- function(a) a[setdiff(names(a), c("anchor"))]
series <- lapply(ASSETS, function(a) {
  d <- dat[[a$symbol]]
  o <- c(meta_of(a), list(date = format(d$date), close = signif(d$close, 8), volume = round(d$volume, 2)))
  if ("adjclose" %in% names(d) && any(!is.na(d$adjclose))) o$adjclose <- signif(d$adjclose, 8)
  if (!is.null(nyc[[a$symbol]])) o$nyclose <- list(date = format(nyc[[a$symbol]]$date), price = signif(nyc[[a$symbol]]$price, 8))
  o
})
generated <- fmt_utc(now_utc)
write_json(list(generated_utc = generated, ref_date = format(REF_DATE), order = names(ASSETS), assets = series),
           file.path(OUT_DIR, "prices.json"), auto_unbox = TRUE, digits = NA, null = "null", na = "null")
write_json(list(generated_utc = generated, funds = funds), file.path(OUT_DIR, "funds.json"),
           auto_unbox = TRUE, digits = NA, na = "null")
write_json(list(generated_utc = generated, ref_date = format(REF_DATE), latest = latest, brief = brief,
                status = STATUS, qc = qc, data_fixes = CFG$data_fixes,
                epochs = list(reference_epoch = EPOCH_REF, reference_start_utc = fmt_utc(EPOCH_REF_START),
                              epoch_seconds = EPOCH_SECONDS, current_epoch = cur_epoch,
                              current_start_utc = fmt_utc(ep_start(cur_epoch)), next_start_utc = fmt_utc(ep_start(cur_epoch + 1))),
                sources = list(coinbase = "https://api.exchange.coinbase.com (public candles)",
                               yahoo = "https://query1.finance.yahoo.com/v8/finance/chart")),
           file.path(OUT_DIR, "summary.json"), auto_unbox = TRUE, digits = 8, pretty = TRUE, na = "null")
failed <- names(Filter(function(s) !isTRUE(s$ok), STATUS))
if (length(failed)) log_msg("WARNING: failed sources: %s", paste(failed, collapse = ", "))
log_msg("done")
