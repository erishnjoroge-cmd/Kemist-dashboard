# Production 11.3 findings

The current Production 11.3 snapshot is not empty or inactive. Its multi-sport engine already stores a large research history and fresh projection candidates, but the strict money gate is preventing that work from becoming visible forward evidence.

## Evidence in the uploaded snapshot

- `data/multisport_engine/latest.json` contains **113 latest projections**.
- `data/multisport_engine/learning.json` contains **1,067 semantically accepted settled research outcomes** from **1,607 raw settlements**.
- The current engine patch reports only a small Precision-qualified sample while the general research ledger is much larger.
- Example current candidates are legitimate pregame projections but are blocked by requirements such as `edge_uncertainty_ratio_under_2_33`, `raw_probability_under_99`, and minimum calibration evidence.
- The existing weekly 2/2 validator requires candidates to pass the upstream Precision Gate, so `0 Precision Open` naturally cascades into `0 Pairable` and `0 Legal Pairs`.

## Architectural fix

Do **not** make the money gate less strict merely to create action. Instead create two independent lanes:

1. **Forward Lab / research lane**
   - freezes legitimate pregame projections from the fresh live board;
   - does not require the full Precision/RTL gate;
   - settles every frozen projection;
   - reports W/L, MAE, hit rate, blocker reasons, and diagnostic simulated units;
   - never relabels a historical pick after the result.

2. **RTL / 2-of-2 money lane**
   - keeps the stricter Precision rules;
   - only promotes a pick if it independently passed before the event;
   - remains separate from Forward Lab results.

`src/forward_lab.mjs` implements the first lane without modifying the existing Precision Gate.

## Forward Lab admission floor

The research lane still refuses junk. A candidate needs an observed reference line, a future start time, an actionable MORE/LESS direction, at least five history samples, nonzero edge, edge/uncertainty ratio >= 0.75, and raw model probability >= 70%.

These are **research** thresholds, not betting recommendations. They exist so Kemist accumulates prospective evidence instead of remaining visually frozen whenever the money gate is closed.
