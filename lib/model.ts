// The token radar's value model: one sealed DefiLlama snapshot in, one ranked board out.
//
// What the board is. The board ranks protocols that record no token yet by what a token
// launch would be worth if the protocol's record stayed as it is. It never predicts whether
// or when a token is issued. Every row is a protocol the snapshot records with no market cap,
// no CoinGecko id and no symbol, and the board applies the watchlist's own exclusion rule to
// every row, not just the watchlist: no wrapped, staked or bridged product, no exchange
// product, no versioned pool. Protocols whose token already trades are kept apart in the
// Live view, where the market's own market cap is shown, never a model's guess.
//
// How the implied value is derived. Every figure comes from the snapshot; no protocol name
// is ever special-cased and no row is hand-picked:
//
//   base multiple   the market's own price of a dollar of TVL: the median mcap/TVL ratio
//                   of the snapshot's live-token protocols with at least $10M of TVL,
//                   clamped to [0.10, 0.30]. The snapshot prices the model, not the author.
//   growth          clamp(change_7d, -60, 120) per cent; growth multiplier = 1 + growth/100 x 0.5.
//                   A week's surge lifts the value, a week's slide cuts it, and the clamp
//                   keeps one wild week (the snapshot holds a +4448% print) from owning the board.
//   maturity        0.55 + 0.45 x sqrt(min(age_days, 1095) / 1095). A protocol that has run
//                   years with no token has earned the full weight; the curve rises fast in
//                   the first year and then flattens. Unknown age counts as 365 days.
//   breadth         1 + 0.015 x min(chains - 1, 10). A protocol live on many chains reaches
//                   more users, so its launch is worth a little more; capped at 11 chains.
//   category        the market prices some categories richer per dollar of TVL than others.
//                   For each category with at least 3 live-token protocols, the factor is
//                   the category's median mcap/TVL over the global median, clamped to
//                   [0.75, 1.33] and shrunk toward 1 by n/(n+4), so a thin sample barely
//                   moves the value. Categories with no live sample get 1.0.
//
//   implied = max(1, round(tvl_usd x base x growth x maturity x breadth x category))
//
// The dashboard recomputes every row from the same figures (its impliedOf function) and
// shows the check beside the number board.json carries, so the page's arithmetic and the
// board's data are visibly the same model.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunable constants. The base multiple and the category factors are calibrated
 *  from the snapshot itself (see calibrate); the rest are stated here and in the dashboard. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  base_floor: number;
  base_cap: number;
  category_floor: number;
  category_cap: number;
  category_shrink: number;
  category_min_sample: number;
  calibration_min_tvl: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.015,
  breadth_max_chains: 10,
  base_floor: 0.1,
  base_cap: 0.3,
  category_floor: 0.75,
  category_cap: 1.33,
  category_shrink: 4,
  category_min_sample: 3,
  calibration_min_tvl: 10_000_000,
};

/** The model's version label, shown in the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** The most pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 20;

/** What calibrate learned from the snapshot's own live-token protocols. */
export interface Calibration {
  /** Median mcap/TVL of live-token protocols, clamped to [base_floor, base_cap]. */
  base_multiple: number;
  /** The unclamped median, so the dashboard can show the calibration honestly. */
  global_median_ratio: number;
  /** How many live-token protocols priced the median. */
  live_sample: number;
  /** Per-category multiplier, only for categories with a live sample. */
  category_factor: Record<string, number>;
  /** How many live-token protocols priced each category factor. */
  category_sample: Record<string, number>;
}

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: null;
  listed_at: string | null;
  gecko_id: null;
  symbol: null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    category_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One row as the dashboard reads it: the board's figures plus the exact farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  category_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model that scored it. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers; null when the list is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is missing or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * Calibrate the model from the snapshot's own live-token protocols: the base multiple is the
 * median mcap/TVL of the live-token protocols with at least `calibration_min_tvl` of TVL, and
 * each category's factor is its own median over the global one, clamped and shrunk toward 1.
 * Deterministic: the same snapshot always calibrates the same numbers.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd >= model.calibration_min_tvl,
  );
  const globalMedian = median(live.map((p) => p.mcap_usd! / p.tvl_usd)) ?? 0.2;
  const base = Math.min(model.base_cap, Math.max(model.base_floor, globalMedian));

  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    if (p.category === null) continue;
    const list = byCategory.get(p.category) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(p.category, list);
  }
  const category_factor: Record<string, number> = {};
  const category_sample: Record<string, number> = {};
  for (const [category, ratios] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ratios.length < model.category_min_sample) continue;
    const catMedian = median(ratios)!;
    const raw = Math.min(model.category_cap, Math.max(model.category_floor, catMedian / globalMedian));
    // Shrink toward 1: a category priced by few live protocols barely moves the value.
    const factor = 1 + (ratios.length / (ratios.length + model.category_shrink)) * (raw - 1);
    category_factor[category] = round4(factor);
    category_sample[category] = ratios.length;
  }
  return {
    base_multiple: round4(base),
    global_median_ratio: round4(globalMedian),
    live_sample: live.length,
    category_factor,
    category_sample,
  };
}

/** The five multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  categoryMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + model.maturity_range * Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const categoryMult = protocol.category === null ? 1 : (calibration.category_factor[protocol.category] ?? 1);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * calibration.base_multiple * growthMult * maturityMult * breadthMult * categoryMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, categoryMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** An exchange's name at the start of a protocol name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories the watchlist rule keeps out: wrapped, staked, bridged or exchange products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol may be ranked: it records no token, and it is not a wrapped, staked or
 * bridged product of a token that already trades. The watchlist's own exclusion rule, applied
 * to every row of the board, not just the watchlist.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest implied value first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, whatever the model's ranking says.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: null,
    listed_at: s.p.listed_at,
    gecko_id: null,
    symbol: null,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: calibration.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      category_multiplier: round4(s.categoryMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** One step as a single string: its action, then its cost and time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The category's two actions, in the words a farmer can follow: a first position, then a second
 * qualifying action that is different from the first. Derived from the category alone, never
 * from a protocol's name.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): [string, string] {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return [
      `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
      `Borrow $${Math.max(10, Math.round(capital / 5))} against that supply and repay it a week later, so both sides of the market are on your record.`,
    ];
  }
  if (c.includes('dex') || c.includes('liquidity manager')) {
    return [
      `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position open.`,
      `Route one swap of at least $10 through ${name} each week so the wallet shows trading activity as well as liquidity.`,
    ];
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm')) {
    return [
      `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and keep the shares.`,
      `Harvest or compound the vault's rewards once a week instead of letting them sit unclaimed.`,
    ];
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return [
      `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
      `Split the next $${Math.max(25, Math.round(capital / 2))} across a second ${name} vault, so two strategies carry your wallet.`,
    ];
  }
  if (c.includes('rwa')) {
    return [
      `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it.`,
      `Hold the asset through one full yield distribution cycle before judging the position.`,
    ];
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return [
      `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`,
      `Close and reopen a small position once a week, keeping the margin above the maintenance level at all times.`,
    ];
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('anchor btc')) {
    return [
      `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
      `Restake the staking rewards once a month instead of withdrawing them.`,
    ];
  }
  if (c.includes('basis')) {
    return [
      `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the shares.`,
      `Hold through one full funding cycle, about two weeks, before adding or withdrawing.`,
    ];
  }
  if (c.includes('bridge')) {
    return [
      `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
      `Bridge a second, smaller amount back a week later so the wallet shows both directions.`,
    ];
  }
  if (c.includes('prediction')) {
    return [
      `Fund $${capital} and place one market position on ${name}.`,
      `Hold the position to the market's resolution instead of exiting on the first move.`,
    ];
  }
  if (c.includes('insurance')) {
    return [
      `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`,
      `Renew the cover before it lapses so the wallet's coverage never gaps.`,
    ];
  }
  if (c.includes('chain')) {
    return [
      `Bridge $${capital} to ${name}'s chain and use its flagship app for one real transaction.`,
      `Make one transaction on the chain each week, such as a swap, a stake or a vote.`,
    ];
  }
  if (c.includes('stable')) {
    return [
      `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
      `Use the stable asset in one of the protocol's own pools instead of leaving it idle.`,
    ];
  }
  return [
    `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    `Make one more qualifying action in the app, such as a second deposit or a vote, within the first week.`,
  ];
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const [first, second] = actionsFor(p, capital, chain);
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    { text: first, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: second, cost: `about $${Math.max(2, Math.round(gas / 2))} of gas`, time: '10 minutes' },
    {
      text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay anyone to claim for you.",
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, carrying the exact farm plan board.json holds. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    category_multiplier: row.model.category_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, calibration, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/**
 * Why a board is not one the gate will take, or null: row count, slug membership, coverage,
 * ranks, order, one shared implied value, and farm steps. main.ts refuses to write a board
 * this function faults.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100 to 4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not a protocol of the snapshot`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'two rows share a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has no name`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${r.slug} has a farm step of ${trimmed.length} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
