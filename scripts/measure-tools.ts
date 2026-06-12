import { allTools } from "../src/tools/index.js";

const json = JSON.stringify(allTools);
console.log("tools:", allTools.length);
console.log("definition bytes:", json.length);
console.log("approx tokens (chars/4):", Math.round(json.length / 4));

// largest individual tool definitions
const sized = allTools
  .map((t) => ({ name: t.name, bytes: JSON.stringify(t).length }))
  .sort((a, b) => b.bytes - a.bytes);
console.log("top 10 heaviest tools:");
for (const t of sized.slice(0, 10)) console.log(" ", t.name, t.bytes);
console.log("avg bytes/tool:", Math.round(json.length / allTools.length));
