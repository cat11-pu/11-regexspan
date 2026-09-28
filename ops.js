// ops.js：模式登记与按文本定位（出错不改状态）
import { splitTop, spanOf } from "./engine.js";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function withState(state) {
  return {
    patterns: (state.patterns || []).slice(),
    records: (state.records || []).map(function (row) { return row.slice(); }),
    rejected: (state.rejected || []).map(function (row) { return row.slice(); }),
    compiled: state.compiled || 0,
    hits: state.hits || 0,
    misses: state.misses || 0
  };
}

export function register(state, pattern) {
  splitTop(pattern);
  if ((state.patterns || []).indexOf(pattern) >= 0) { fail("E_DUP"); }
  const next = withState(state);
  next.patterns.push(pattern);
  next.compiled += 1;
  return next;
}

export function locate(state, pattern, text) {
  if ((state.patterns || []).indexOf(pattern) < 0) { fail("E_UNKNOWN"); }
  const next = withState(state);
  const span = spanOf(pattern, text);
  if (span === null) {
    next.records.push([pattern, text, -1, -1]);
    next.misses += 1;
  } else {
    next.records.push([pattern, text, span[0], span[1]]);
    next.hits += 1;
  }
  return next;
}
