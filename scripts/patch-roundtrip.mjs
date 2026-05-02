// Patches $TINYGOROOT/src/net/http/roundtrip_js.go to fix t.roundTrip → roundTrip.
// Required for tinygo v0.41.1 — the method call was changed to a function call in
// the fix but not released until after v0.41.1.
// See: https://github.com/tinygo-org/tinygo/pull/5350
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const tinygoRoot = execSync("tinygo env TINYGOROOT", { encoding: "utf8" }).trim();
const file = `${tinygoRoot}/src/net/http/roundtrip_js.go`;
const src = readFileSync(file, "utf8");

if (src.includes("t.roundTrip(req)")) {
    execSync(`sudo sed -i 's/t\\.roundTrip(req)/roundTrip(req)/' "${file}"`);
    console.log("patch-roundtrip: fixed t.roundTrip → roundTrip");
} else {
    console.log("patch-roundtrip: already fixed, skipping");
}
