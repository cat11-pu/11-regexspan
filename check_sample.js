import fs from "node:fs";
import { splitTop, spanOf, hitOf } from "./engine.js";
import { register, locate } from "./ops.js";
import { render } from "./app.js";

const __lines = [];
function emit(label, value) {
  __lines.push([String(label).replace(/ =$/, ""), value]);
}

const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/scene.json", "utf8"));
const view = render(spec);

emit("收尾后模式表", view.patterns);
emit("收尾后分支表", view.branches);
emit("收尾后拒绝账", view.rejected);
emit("收尾后匹配记录", view.records);
emit("收尾后命中条数", view.hit_count);
emit("收尾后未命中条数", view.miss_count);
emit("收尾后编译成功数", view.compiled);
emit("收尾后命中长度", view.lengths);
emit("跨度合法", view.span_ok);
emit("命中未命中加总一致", view.tally_ok);
emit("记录的模式都已登记", view.records_known);
emit("模式表无重复", view.unique);
emit("重放不新增", view.replay_new);
emit("重放报错条数", view.replay_failed);

// ---- 错误路径探针：真调用实现，看它报出什么码 ----
try {
  spanOf("?a", "abc");
  emit("量词悬空报码", "没有报错");
} catch (error) {
  emit("量词悬空报码", error && error.code ? error.code : String(error.message));
}
try {
  spanOf("a[dc-b]x", "abx");
  emit("区间倒置报码", "没有报错");
} catch (error) {
  emit("区间倒置报码", error && error.code ? error.code : String(error.message));
}
try {
  splitTop("(ab");
  emit("括号不配报码", "没有报错");
} catch (error) {
  emit("括号不配报码", error && error.code ? error.code : String(error.message));
}
try {
  spanOf("^a^", "a");
  emit("锚点越位报码", "没有报错");
} catch (error) {
  emit("锚点越位报码", error && error.code ? error.code : String(error.message));
}
try {
  register({ patterns: ["a*"], records: [], rejected: [], compiled: 1, hits: 0, misses: 0 }, "a*");
  emit("重复登记报码", "没有报错");
} catch (error) {
  emit("重复登记报码", error && error.code ? error.code : String(error.message));
}
try {
  locate(spec.state, "zzz", "abc");
  emit("未登记定位报码", "没有报错");
} catch (error) {
  emit("未登记定位报码", error && error.code ? error.code : String(error.message));
}

// ---- 纯函数尾测（不改状态的老值） ----
emit("尾测", [hitOf("a*", "baa"), hitOf("a[bc]*d", "xy"), spanOf("(a|ab)", "abz"),
              splitTop("^ab|cd$").length]);

// ---- 期望值（参考模型算出）----
const EXPECTED = {
  "收尾后模式表": [
    "a[bc]*d",
    "(a|ab)",
    "(ab|cd)+",
    "^ab|cd$",
    "a*"
  ],
  "收尾后分支表": [
    [
      "a[bc]*d",
      [
        "a[bc]*d"
      ]
    ],
    [
      "(a|ab)",
      [
        "(a|ab)"
      ]
    ],
    [
      "(ab|cd)+",
      [
        "(ab|cd)+"
      ]
    ],
    [
      "^ab|cd$",
      [
        "^ab",
        "cd$"
      ]
    ],
    [
      "a*",
      [
        "a*"
      ]
    ]
  ],
  "收尾后拒绝账": [
    [
      "a[dc-b]x",
      "E_BAD_RANGE"
    ],
    [
      "?a",
      "E_BAD_QUANT"
    ],
    [
      "a[bc]*d",
      "E_DUP"
    ],
    [
      "(ab",
      "E_BAD_PATTERN"
    ],
    [
      "zzz",
      "E_UNKNOWN"
    ]
  ],
  "收尾后匹配记录": [
    [
      "a[bc]*d",
      "abcdbcd",
      0,
      4
    ],
    [
      "(a|ab)",
      "abz",
      0,
      2
    ],
    [
      "(ab|cd)+",
      "abcdab",
      0,
      6
    ],
    [
      "^ab|cd$",
      "abz",
      0,
      2
    ],
    [
      "a*",
      "baa",
      0,
      0
    ],
    [
      "a[bc]*d",
      "xy",
      -1,
      -1
    ]
  ],
  "收尾后命中条数": 5,
  "收尾后未命中条数": 1,
  "收尾后编译成功数": 5,
  "收尾后命中长度": [
    4,
    2,
    6,
    2,
    0,
    0
  ],
  "跨度合法": true,
  "命中未命中加总一致": true,
  "记录的模式都已登记": true,
  "模式表无重复": true,
  "重放不新增": 0,
  "重放报错条数": 5,
  "量词悬空报码": "E_BAD_QUANT",
  "区间倒置报码": "E_BAD_RANGE",
  "括号不配报码": "E_BAD_PATTERN",
  "锚点越位报码": "E_ANCHOR",
  "重复登记报码": "E_DUP",
  "未登记定位报码": "E_UNKNOWN",
  "尾测": [
    true,
    false,
    [
      0,
      2
    ],
    2
  ]
};
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  if (__same(found[1], want)) { console.log("一致 " + label + " = " + JSON.stringify(found[1])); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(found[1])); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
