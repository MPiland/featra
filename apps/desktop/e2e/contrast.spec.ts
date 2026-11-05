import { expect, test, type Page } from "@playwright/test";
import { launch, tempUserData } from "./app.ts";
import { contrast, luminance, parseCssColor, resolve, sampleRenderedText, tokenColours } from "./contrast.ts";

/**
 * AC4: the window follows the OS theme and meets WCAG AA. The OS theme is faked with prefers-color-scheme
 * emulation; everything measured is what the real app renders.
 */
const AA_TEXT = 4.5;
const AA_LARGE_TEXT = 3;
const AA_NON_TEXT = 3;
const STATUS = ["--ok", "--warn", "--bad", "--acc", "--pur"];
const SURFACES = ["--bg", "--side", "--row"];

async function failures(page: Page): Promise<string[]> {
  const out: string[] = [];
  const samples = await sampleRenderedText(page);
  // Guard against a vacuous pass: at least the view title, the placeholder text and the title bar icons.
  expect(samples.filter((s) => s.kind === "text").length).toBeGreaterThanOrEqual(2);
  expect(samples.filter((s) => s.kind === "icon").length).toBeGreaterThanOrEqual(4);
  for (const s of samples) {
    const { fg, bg } = resolve(s);
    const need = s.kind === "icon" ? AA_NON_TEXT : s.large ? AA_LARGE_TEXT : AA_TEXT;
    const ratio = contrast(fg, bg);
    if (ratio < need) out.push(`${s.kind} ${s.what}: ${ratio.toFixed(2)} < ${need}`);
  }
  return out;
}

test.describe("AC4: theme follows the OS and meets WCAG AA", () => {
  for (const scheme of ["dark", "light"] as const) {
    test(`${scheme}`, async () => {
      const profile = await tempUserData();
      const { app, page } = await launch(profile.dir);
      try {
        await page.emulateMedia({ colorScheme: scheme });

        // Follows the OS: the page background is dark in dark mode and light in light mode.
        const bodyBg = parseCssColor(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
        if (scheme === "dark") expect(luminance(bodyBg)).toBeLessThan(0.05);
        else expect(luminance(bodyBg)).toBeGreaterThan(0.85);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(scheme);

        // Every rendered text and icon, in every view, with the menu open, and with the sidebar collapsed.
        const problems: string[] = [];
        for (const name of ["Work", "Inbox", "Artifacts", "Plugins", "Settings"]) {
          await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name }).click();
          problems.push(...(await failures(page)));
        }
        await page.getByRole("button", { name: "Menu" }).click();
        await expect(page.getByRole("menu")).toBeVisible();
        problems.push(...(await failures(page)));
        await page.keyboard.press("Escape");
        await page.keyboard.press("Control+B");
        problems.push(...(await failures(page)));
        expect(problems).toEqual([]);

        // Status colours, read from the live stylesheet, as text on every surface they can sit on.
        const tokens = await tokenColours(page, [...STATUS, ...SURFACES]);
        const statusFailures: string[] = [];
        for (const st of STATUS) {
          for (const sf of SURFACES) {
            const ratio = contrast(parseCssColor(tokens[st]!), parseCssColor(tokens[sf]!));
            if (ratio < AA_TEXT) statusFailures.push(`${st} on ${sf}: ${ratio.toFixed(2)}`);
          }
        }
        expect(statusFailures).toEqual([]);
      } finally {
        await app.close();
        await profile.dispose();
      }
    });
  }
});
