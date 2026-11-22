# Compares docs/assets/js/stats.js with base R. Run from the repo root:
#   Rscript tests/validate_stats.R     (requires node)
library(jsonlite)
j <- fromJSON(system("node tests/stats_dump.js", intern = TRUE), simplifyVector = FALSE)
rel <- function(a, b) abs(a - b) / pmax(abs(b), 1e-12)
q <- do.call(rbind, lapply(j$q, as.data.frame))
cat(sprintf("qnorm  max rel err: %.2e\n", max(rel(q$qnorm, qnorm(q$p)))))
qt_err <- max(rel(q$qt, qt(q$p, q$df)))
cat(sprintf("qt     max rel err: %.2e  (df >= 3)\n", qt_err))
stopifnot(qt_err < 1e-8)
cat(sprintf("qchisq max rel err: %.2e  (df >= 3)\n", max(rel(q$qchisq, qchisq(q$p, q$df)))))
worst <- 0
for (p in j$pairs) {
  x <- unlist(p$rx); y <- unlist(p$ry); L <- p$level; n <- length(y)
  f <- lm(y ~ x); ci <- confint(f, level = L); ct <- cor.test(x, y, conf.level = L)
  tt <- t.test(y, conf.level = L); s2 <- var(y); a <- (1 - L) / 2
  R  <- c(coef(f)[2], ci[2, ], coef(f)[1], ci[1, ], summary(f)$r.squared, ct$estimate, ct$conf.int,
          sqrt(s2), sqrt((n - 1) * s2 / qchisq(1 - a, n - 1)), sqrt((n - 1) * s2 / qchisq(a, n - 1)), tt$conf.int)
  JS <- c(p$ols$beta, p$ols$beta_lo, p$ols$beta_hi, p$ols$alpha, p$ols$alpha_lo, p$ols$alpha_hi, p$ols$r2,
          p$cor$est, p$cor$lo, p$cor$hi, p$sd$est, p$sd$lo, p$sd$hi, p$mean$lo, p$mean$hi)
  e <- max(rel(JS, unname(R))); worst <- max(worst, e)
  cat(sprintf("%-8s ~ %-8s from %s, %2.0f%% CI, n=%4d: beta %.4f [%.4f, %.4f]  r %.4f [%.4f, %.4f]  max rel err %.1e\n",
              p$y, p$x, p$from, 100 * L, n, R[1], R[2], R[3], R[8], R[9], R[10], e))
}
stopifnot(worst < 1e-3)
cat("OK: JS statistics agree with R\n")

# ---- extended checks ---------------------------------------------------------
ext <- j$ext; errs <- c()
for (p in ext$p) {
  R <- switch(p$kind, pbeta = pbeta(p$x, p$a, p$b), pt2 = 2 * pt(-abs(p$t), p$df), pf = pf(p$F, p$d1, p$d2, lower.tail = FALSE))
  errs <- c(errs, rel(p$v, R))
}
cat(sprintf("pbeta/pt/pf   max rel err: %.1e\n", max(errs)))
pr <- j$pairs[[2]]; x <- unlist(pr$rx); y <- unlist(pr$ry); fit <- lm(y ~ x)
if (requireNamespace("sandwich", quietly = TRUE)) {
  for (h in ext$hac) {
    V <- sandwich::NeweyWest(fit, lag = h$lag, prewhite = FALSE, adjust = FALSE)
    e <- max(rel(c(h$se_alpha, h$se_beta), sqrt(diag(V))))
    cat(sprintf("Newey-West lag %2d: se(beta) JS %.6f  R %.6f  rel err %.1e\n", h$lag, h$se_beta, sqrt(V[2, 2]), e)); worst <- max(worst, e)
  }
  ly <- unlist(ext$trend$y); tt <- seq_along(ly) - 1; ft <- lm(ly ~ tt)
  V <- sandwich::NeweyWest(ft, lag = 10, prewhite = FALSE, adjust = FALSE)
  e <- rel(ext$trend$se_beta, sqrt(V[2, 2])); worst <- max(worst, e)
  cat(sprintf("trend HAC se: JS %.3e  R %.3e  rel err %.1e\n", ext$trend$se_beta, sqrt(V[2, 2]), e))
} else cat("sandwich not installed: Newey-West check skipped\n")
r <- unlist(ext$anova$r); wd <- factor(unlist(ext$anova$wd)); a <- anova(lm(r ~ wd))
e <- max(rel(c(ext$anova$res$F, ext$anova$res$p), c(a$`F value`[1], a$`Pr(>F)`[1]))); worst <- max(worst, e)
cat(sprintf("weekday ANOVA: F %.4f p %.4f (R: F %.4f p %.4f) rel err %.1e\n", ext$anova$res$F, ext$anova$res$p, a$`F value`[1], a$`Pr(>F)`[1], e))
e_ccf <- 0
for (c in ext$ccf$res) {
  k <- c$lag; n <- length(x); idx <- seq_len(n); keep <- idx + k >= 1 & idx + k <= n
  R <- cor(x[keep], y[idx[keep] + k]); e_ccf <- max(e_ccf, rel(c$r, R))
}
worst <- max(worst, e_ccf)
cat(sprintf("cross-correlation lags -2..2 max rel err: %.1e\n", e_ccf))
if (requireNamespace("sandwich", quietly = TRUE)) for (h in ext$hacmean) {
  V <- sandwich::NeweyWest(lm(y ~ 1), lag = h$lag, prewhite = FALSE, adjust = FALSE)
  e <- rel(h$se, sqrt(V[1, 1])); worst <- max(worst, e)
  cat(sprintf("Newey-West mean, lag %2d: se JS %.3e  R %.3e  rel err %.1e\n", h$lag, h$se, sqrt(V[1, 1]), e))
}
for (w in ext$wilson) {
  ci <- prop.test(w$k, w$n, correct = FALSE)$conf.int; e <- max(rel(c(w$lo, w$hi), ci)); worst <- max(worst, e)
  cat(sprintf("Wilson %d/%d: [%.4f, %.4f] vs prop.test [%.4f, %.4f]\n", w$k, w$n, w$lo, w$hi, ci[1], ci[2]))
}
b <- ext$boot
cat(sprintf("bootstrap sanity (iid normal, n=2000): boot [%.4f, %.4f] vs t [%.4f, %.4f]\n", b$boot_lo, b$boot_hi, b$t_lo, b$t_hi))
stopifnot(max(errs) < 1e-8, worst < 1e-3, abs((b$boot_hi - b$boot_lo) / (b$t_hi - b$t_lo) - 1) < 0.1)
cat("OK: extended statistics agree with R\n")
