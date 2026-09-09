import assert from "node:assert/strict";
import {
  fixtureDataset,
  PROTECTION_FIXTURES,
  runFixture,
} from "../src/lib/protection-fixtures";

const results = PROTECTION_FIXTURES.map(runFixture);
for (const run of results) {
  console.log(
    `${run.matchedExpectation ? "PASS" : "FAIL"} ${run.id}: expected ${run.expected}, observed ${run.result.decision}`,
  );
  assert(run.matchedExpectation, `Unexpected result in ${run.id}`);
}
console.log(
  `${results.length}/${results.length} synthetic cases matched their declared expectations. No real-world accuracy or savings claim.`,
);
if (process.argv.includes("--json"))
  console.log(JSON.stringify({ ...fixtureDataset(), results }, null, 2));
