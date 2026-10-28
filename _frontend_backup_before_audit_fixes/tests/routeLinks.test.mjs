import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every internal link must resolve to a route the app actually registers.
 *
 * This shipped broken: the employer dashboard linked each job to
 * `/jobs/:id/applicants`, but the registered route is `/applicants/:jobId`.
 * React Router matched neither, fell through to the `*` route, and the
 * employer got the Not Found page from a button that sat directly beside a
 * second, working Applicants button. Nothing failed loudly - a dead internal
 * link renders a valid page.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.jsx?$/.test(full) ? [full] : [];
  });
}

const registered = [
  ...readFileSync(path.join(SRC, "routes/AppRoutes.jsx"), "utf8").matchAll(/path="([^"]+)"/g),
].map((m) => m[1]);

test("AppRoutes declares routes, so this test has something to check against", () => {
  assert.ok(registered.length > 5, `only found ${registered.length} routes`);
  assert.ok(registered.includes("*"), "no catch-all route found");
});

test("every internal link resolves to a registered route", () => {
  const patterns = registered
    .filter((r) => r !== "*")
    .map((r) => new RegExp("^" + r.replace(/:[A-Za-z]+/g, "[^/]+").replace(/\//g, "\\/") + "$"));

  // `to={...}` (note the brace), `to="..."` and `navigate(...)`.
  const LINK = /(?:to=\{?|navigate\()\s*[`"']([^`"'$)]*(?:\$\{[^}]*\}[^`"']*)*)[`"']/g;

  const dead = new Set();
  for (const file of sourceFiles(SRC)) {
    for (const [, raw] of readFileSync(file, "utf8").matchAll(LINK)) {
      if (!raw.startsWith("/")) continue; // relative or external
      const probe = raw.replace(/\$\{[^}]*\}/g, "X").split("?")[0];
      if (!patterns.some((p) => p.test(probe))) {
        dead.add(`${path.relative(SRC, file)} -> ${raw}`);
      }
    }
  }
  assert.deepEqual([...dead], [], `these links render the Not Found page:\n  ${[...dead].join("\n  ")}`);
});

test("the employer dashboard does not show two Applicants actions for one job", () => {
  // They were adjacent, identical in icon and label, and one was dead.
  const dashboard = readFileSync(path.join(SRC, "pages/EmployerDashboardPage.jsx"), "utf8");
  const applicantsActions = [...dashboard.matchAll(/applicants/gi)].filter(
    (m) => !dashboard.slice(Math.max(0, m.index - 120), m.index).includes("/*")
  );
  // The page itself should no longer route to applicants at all; the action
  // belongs to the shared <JobStatusActions> component.
  const ownLinks = [...dashboard.matchAll(/(?:to=\{?|navigate\()[^;]{0,80}applicants/gi)];
  assert.strictEqual(
    ownLinks.length,
    0,
    `the dashboard links to applicants itself (${ownLinks.length}); JobStatusActions already does`
  );
  assert.ok(dashboard.includes("JobStatusActions"), "the shared actions component is no longer rendered");
});
