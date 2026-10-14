# Production 11.3 Forward Lab live integration

This change is the bridge from the tested Forward Lab modules into the exact uploaded Production 11.3 server.

## Exact source guard

The patch only accepts the Production 11.3 `server.mjs` SHA-256:

`eaec113ed4acb7bdabe4eb42664f2c3feb4ddb471b79ace7d6b395b9550b4c55`

Anything else is a safety stop. It creates a timestamped backup before writing.

## Integration performed

- imports `forward_lab_runtime.mjs` into the legacy production server;
- creates a five-minute Forward Lab runtime with an immediate first cycle;
- adds Forward Lab summary data to the main dashboard build;
- renders the `🧪 FORWARD LAB — TAKE THE EXAM` panel before the 2/2 Command Center;
- exposes `/api/forward-lab`, `/api/forward-lab/status`, `/run`, `/start`, `/stop`;
- includes Forward Lab telemetry in `/api/health` and `/api/status`;
- starts Forward Lab automatically at server boot;
- does **not** weaken Precision, RTL, 2/2, settlement or learning gates.

## Validation performed against uploaded Production (11)(3)

The patch was applied to a clean extraction of the uploaded Production 11.3 `server.mjs` and then checked with `node --check`.

Original SHA-256: `eaec113ed4acb7bdabe4eb42664f2c3feb4ddb471b79ace7d6b395b9550b4c55`

Patched SHA-256: `13e8d695c736e5ee533a01f122f5fd317745aecd9b361fdabab15852d1ce931b`

The syntax check passed.

## Intended behavior

Forward Lab is the research lane. It should keep producing immutable pregame reps from fresh legitimate projections even when the money gate produces zero plays. Those reps settle into W/L, hit rate, MAE and diagnostic simulated P&L/ROI. They never become RTL retroactively.

RTL / 2-of-2 remains the separate money lane and stays strict.
