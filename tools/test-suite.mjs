import assert from "node:assert";
import fs from "node:fs";
import { KitchenClock } from "../script.js";
import { PiiGuard } from "../site.js";

console.log("=== Running Aahira Home Kitchen Automated Tests ===");

// 1. Test Menu JSON Integrity
console.log("\n[1] Verifying data/menu.json...");
const menuData = JSON.parse(fs.readFileSync("data/menu.json", "utf8"));
assert.strictEqual(menuData.length, 40, "Menu should have exactly 40 items.");

const cuisines = new Set(menuData.map(it => it.cuisine));
assert.deepStrictEqual(Array.from(cuisines).sort(), ["Bengali", "Chinese", "Punjabi", "Tamil"].sort());

const categories = new Set(menuData.map(it => it.category));
assert.deepStrictEqual(Array.from(categories).sort(), ["Appetizer", "Dinner", "Hard Drink", "Lunch", "Soft Drink"].sort());

// Check hard drink alcoholic flags
const hardDrinks = menuData.filter(it => it.category === "Hard Drink");
assert.strictEqual(hardDrinks.length, 8, "Should have 8 hard drinks across 4 cuisines.");
hardDrinks.forEach(it => {
  assert.strictEqual(it.alcoholic, true, `${it.id} must be flagged alcoholic.`);
});
console.log("✓ Menu integrity verified (40 items, 4 cuisines, 5 categories, 8 hard drinks).");

// 2. Test KitchenClock
console.log("\n[2] Testing KitchenClock...");
const clock = new KitchenClock("America/Indiana/Indianapolis");
const nowParts = clock.nowParts();
assert.ok(nowParts.year >= 2026, "Year should be 2026 or later.");
assert.strictEqual(clock.minutes("10:30"), 630);
assert.strictEqual(clock.formatMinutes(630), "10:30");
assert.strictEqual(clock.addDays("2026-11-17", 3), "2026-11-20");
console.log("✓ KitchenClock tests passed.");

// 3. Test PiiGuard Sanitization
console.log("\n[3] Testing PiiGuard Client-Side Privacy Sanitizer...");
const emailTest = PiiGuard.scrub("Contact me at user@example.com for info");
assert.strictEqual(emailTest.wasScrubbed, true);
assert.ok(emailTest.text.includes("[email removed]"));
assert.ok(!emailTest.text.includes("user@example.com"));

const phoneTest = PiiGuard.scrub("Call my mobile (570) 780-7680 please");
assert.strictEqual(phoneTest.wasScrubbed, true);
assert.ok(phoneTest.text.includes("[phone removed]"));
assert.ok(!phoneTest.text.includes("780-7680"));

const cardTest = PiiGuard.scrub("My visa card is 4111 2222 3333 4444 thanks");
assert.strictEqual(cardTest.wasScrubbed, true);
assert.ok(cardTest.text.includes("[card number removed]"));

const addressTest = PiiGuard.scrub("Please deliver to 3017 Warren Way ASAP");
assert.strictEqual(addressTest.wasScrubbed, true);
assert.ok(addressTest.text.includes("[address removed]"));

const ssnTest = PiiGuard.scrub("My SSN is 123-45-6789");
assert.strictEqual(ssnTest.wasScrubbed, true);
assert.ok(ssnTest.text.includes("[id removed]"));

const cleanTest = PiiGuard.scrub("Can you recommend a nut-free vegan dinner?");
assert.strictEqual(cleanTest.wasScrubbed, false);
assert.strictEqual(cleanTest.text, "Can you recommend a nut-free vegan dinner?");

console.log("✓ PiiGuard tests passed (emails, phones, cards, addresses, SSNs scrubbed).");

// 4. Test i18n Keys Matching
console.log("\n[4] Testing i18n Localization Keys...");
const en = JSON.parse(fs.readFileSync("i18n/en.json", "utf8"));
const languages = ["hi", "es", "zh", "bn"];
const enKeys = Object.keys(en).sort();

for (const lang of languages) {
  const dict = JSON.parse(fs.readFileSync(`i18n/${lang}.json`, "utf8"));
  for (const k of enKeys) {
    assert.ok(dict[k] !== undefined, `Language '${lang}' missing key '${k}'.`);
  }
}
console.log("✓ All 5 language files contain 100% complete matching keys.");

// 5. Test Network & Manifest Consistency
console.log("\n[5] Testing Network and Manifest Consistency...");
const manifest = JSON.parse(fs.readFileSync("agent-manifest.json", "utf8"));
const network = JSON.parse(fs.readFileSync("aahira_kitchen.network.json", "utf8"));

assert.strictEqual(manifest.networks[0].name, "aahira_kitchen");
assert.strictEqual(manifest.networks[0].front_man, "aahira_assistant");
assert.strictEqual(manifest.networks[0].description, network.metadata.description);
assert.deepStrictEqual(manifest.networks[0].sample_queries, network.metadata.sample_queries);
assert.strictEqual(manifest.actions.agentTools.length, 9);
console.log("✓ Manifest and network JSON consistency verified.");

console.log("\n=======================================================");
console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
console.log("=======================================================");
