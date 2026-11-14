# Token Radar

An entry for make.fun's **token-radar-01** bounty: a token launch radar that ranks
protocols with no token yet by what their launch would be worth, and shows a reader
how to farm each one.

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`/input/snapshot.json` in the
grader, or `--input` locally), calibrates the value model on the snapshot's own
live-token protocols, and writes:

- `board.json` — the ranked board: every protocol on the snapshot's watchlist plus
  the rankable pre-token protocols below the watchlist floor, each with an implied
  value and a six-step farm plan.
- `data.js` — the same board as the dashboard's dataset.
- `dashboard/` — a static, no-network page: the sortable, filterable board, a
  detail view for each protocol, a Live view of protocols whose token already
  trades, and the model stated in full.
- `screenshots/` — three renders of the dashboard: the board, a detail view and a
  filtered view.
- `dossier.json` — the judge's dossier, built with the vendored make.fun library.

## The model

`implied = round(tvl x base x growth x maturity x breadth x category)`

- **base** — the median mcap/TVL of the snapshot's live-token protocols with at
  least $10M of TVL, clamped to 0.10–0.30. The market prices TVL, not the author.
- **growth** — seven-day TVL change, clamped to −60%..+120% and weighted 0.5.
- **maturity** — a square-root curve from 0.55 at listing to 1.00 at three years
  with no token; unknown age counts as 365 days.
- **breadth** — +1.5% per chain past the first, capped at ten extra chains.
- **category** — the category's live-token median mcap/TVL over the global median,
  clamped to 0.75–1.33 and shrunk toward 1 by n/(n+4).

Every ranked row records no token (no market cap, no CoinGecko id, no symbol)
and passes the watchlist's exclusion rule, so no wrapped, staked or bridged
product of a token that already trades is ranked as a launch to come. The
dashboard recomputes every row from the same figures and checks the number
against the one `board.json` carries.

## Run it locally

Requires Node.js 22.18 or later. From the repository root:

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. The run is deterministic:
the same snapshot always writes the same bytes.

## Layout

- `main.ts` — the entrypoint: read, score, write, dossier.
- `lib/model.ts` — the value model, the farm plans and the board builder.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`).
- `screenshots/` — the three renders the dossier carries.
