import assert from "node:assert";
import { splitTop, spanOf, hitOf } from "../engine.js";
import { register, locate } from "../ops.js";
import { render } from "../app.js";

const base = {
  state: { patterns: [], records: [], rejected: [], compiled: 0, hits: 0, misses: 0 },
  events: []
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("splitTop 给数组", () => {
  assert.ok(Array.isArray(splitTop("ab")));
});

check("spanOf 给两元组或空", () => {
  const span = spanOf("a", "ba");
  assert.ok(span === null || Array.isArray(span));
});

check("hitOf 给布尔", () => {
  assert.strictEqual(typeof hitOf("a", "ba"), "boolean");
});

check("register 给状态", () => {
  assert.ok(Array.isArray(register(base.state, "ab").patterns));
});

check("locate 给状态", () => {
  const held = { patterns: ["ab"], records: [], rejected: [], compiled: 1, hits: 0, misses: 0 };
  assert.ok(Array.isArray(locate(held, "ab", "ab").records));
});

check("render 数事件", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("6 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
