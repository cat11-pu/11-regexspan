// app.js：把一条事件流跑成验收视图（模式表、分支表、记录、计数与不变量）
import { splitTop } from "./engine.js";
import { register, locate } from "./ops.js";

function copyState(state) {
  return {
    patterns: (state.patterns || []).slice(),
    records: (state.records || []).map(function (row) { return row.slice(); }),
    rejected: (state.rejected || []).map(function (row) { return row.slice(); }),
    compiled: state.compiled || 0,
    hits: state.hits || 0,
    misses: state.misses || 0
  };
}

function step(state, rejected, event) {
  if (event.kind === "register") {
    return register(state, event.pattern);
  }
  if (event.kind === "locate") {
    return locate(state, event.pattern, event.text);
  }
  const error = new Error("E_BAD_EVENT");
  error.code = "E_BAD_EVENT";
  throw error;
}

function play(state, events) {
  let now = copyState(state);
  const rejected = [];
  let failed = 0;
  for (const event of events || []) {
    try {
      now = step(now, rejected, event);
    } catch (error) {
      failed += 1;
      const code = error && error.code ? error.code : "E_BAD_EVENT";
      const mark = event && event.pattern !== undefined ? event.pattern : String(event && event.kind);
      rejected.push([mark, code]);
    }
  }
  return { state: now, rejected: rejected, failed: failed };
}

function fingerprint(played) {
  const state = played.state;
  return JSON.stringify({
    patterns: state.patterns, records: state.records, rejected: played.rejected,
    compiled: state.compiled, hits: state.hits, misses: state.misses
  });
}

export function render(spec) {
  const played = play(spec.state, spec.events);
  const state = played.state;
  const patterns = state.patterns;
  const records = state.records;
  const branches = patterns.map(function (pattern) {
    let parts = [];
    try { parts = splitTop(pattern); } catch (error) { parts = []; }
    return [pattern, parts];
  });
  let spanOK = true;
  for (const row of records) {
    if (row[2] < 0) { continue; }
    if (row[2] > row[3] || row[3] > row[1].length) { spanOK = false; }
  }
  const lengths = records.map(function (row) { return row[2] >= 0 ? row[3] - row[2] : 0; });
  let unique = true;
  patterns.forEach(function (pattern, spot) {
    if (patterns.indexOf(pattern) !== spot) { unique = false; }
  });
  let known = true;
  for (const row of records) {
    if (patterns.indexOf(row[0]) < 0) { known = false; }
  }
  const replay = play(spec.state, spec.events);
  return {
    patterns: patterns.slice(),
    branches: branches,
    rejected: played.rejected.map(function (row) { return row.slice(); }),
    records: records.map(function (row) { return row.slice(); }),
    hit_count: state.hits,
    miss_count: state.misses,
    compiled: state.compiled,
    lengths: lengths,
    span_ok: spanOK,
    tally_ok: state.hits + state.misses === records.length,
    records_known: known,
    unique: unique,
    replay_new: fingerprint(replay) === fingerprint(played) ? 0 : 1,
    replay_failed: replay.failed,
    count_events: (spec.events || []).length
  };
}
