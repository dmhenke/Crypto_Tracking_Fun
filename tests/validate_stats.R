# Compares docs/assets/js/stats.js with base R. Run from the repo root:
#   Rscript tests/validate_stats.R     (requires node)
library(jsonlite)
j <- fromJSON(system("node tests/stats_dump.js", intern = TRUE), simplifyVector = FALSE)
rel <- function(a, b) abs(a - b) / pmax(abs(b), 1e-12)
q <- do.call(rbind, lapply(j$q, as.data.frame))
cat(sprintf("qnorm  max rel err: %.2e\n", max(rel(q$qnorm, qnorm(q$p)))))
cat(sprintf("qt     max rel err: %.2e  (df >= 8)\n", max(rel(q$qt, qt(q$p, q$df))[q$df >= 8])))
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
