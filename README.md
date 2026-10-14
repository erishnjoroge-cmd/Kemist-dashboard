# Kemist Dashboard

Kemist is a sports-projection research dashboard built around one core rule: predictions must be frozen before outcomes are known, then settled and audited afterward.

## Current reset objective

The project is being rebuilt around two clearly separated lanes:

1. **Forward Lab** — continuously records legitimate pregame projections even when they are not approved for wagering. Each shot is frozen, settled, graded, and added to calibration / error / simulated-P&L evidence.
2. **Ready to Lock (RTL)** — stricter money lane. A candidate may only graduate here after it satisfies production qualification rules. Forward Lab results never become retroactive RTL wins.

## Money accountability

Kemist must measure:

- Forward W/L record
- Projection MAE / signed bias
- Simulated P&L and ROI
- Bankroll and drawdown
- Market / sport profitability
- Line value at freeze versus later available line
- 2/2 card results separately from single-leg performance
- Current blocker counts and stale-data diagnostics

A high hit rate alone is not treated as proof of profitability.

## Production principles

- Never backfill a winning prediction after the result is known.
- Never label a sportsbook feed LIVE unless real attributable data is flowing.
- Archived / stale rows must not count as active candidates.
- Precision gates may block RTL, but they must not block Forward Lab learning.
- Every visible status needs a timestamp and freshness state.
- Settled outcomes are immutable audit evidence.
- No gate should be loosened merely to create betting action.

## Immediate priorities

- Import the current Production core into version control.
- Make Forward Lab a first-class pipeline.
- Remove stale active-candidate inflation.
- Expose candidate death reasons from board -> projection -> calibration -> qualification -> RTL.
- Add P&L / ROI / drawdown accounting.
- Preserve PrizePicks intake while keeping sportsbook adapters isolated.
- Add Pool as research/shadow until forward evidence is sufficient.
- Keep bet365 in WAITING / OFFLINE state until a permitted verified feed is configured.

## Safety / betting note

Kemist is research software. It cannot guarantee profitable wagers or income. Any betting decision should be treated as risking real money, not as guaranteed monetization.
