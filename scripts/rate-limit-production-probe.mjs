// Opt-in probe for the public same-origin abuse gate. Uses only synthetic
// example.invalid identities and never creates a Firebase account.
const origin = process.env.AUTH_TEST_BASE_URL || "https://fluxocriticos.vercel.app";
if (new URL(origin).hostname !== "fluxocriticos.vercel.app") throw new Error("Unexpected production target");
const first = `rate-${crypto.randomUUID()}@example.invalid`;
const second = `rate-${crypto.randomUUID()}@example.invalid`;

async function gate(flow, email) {
  const response = await fetch(`${origin}/api/auth/abuse-check`, {
    method: "POST",
    headers: { Origin: origin, Referer: `${origin}/signup`, "Content-Type": "application/json" },
    body: JSON.stringify({ flow, email }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, retryAfter: response.headers.get("Retry-After"), body: await response.json() };
}

const accountAttempts = [];
for (let attempt = 0; attempt < 6; attempt += 1) accountAttempts.push(await gate("signup", first));
const otherAccount = await gate("signup", second);
const independentReset = await gate("reset", first);
if (accountAttempts.slice(0, 5).some(result => result.status !== 200)) throw new Error("Legitimate account quota blocked early");
if (accountAttempts[5].status !== 429 || !accountAttempts[5].retryAfter || accountAttempts[5].body?.code !== "app/rate-limited") throw new Error("Account ceiling did not return an exact 429");
if (otherAccount.status !== 200) throw new Error("A second account on the same network was blocked");
if (independentReset.status !== 200) throw new Error("Reset incorrectly shared the signup counter");
console.log(JSON.stringify({ result: "passed", signupStatuses: accountAttempts.map(result => result.status), retryAfterSeconds: Number(accountAttempts[5].retryAfter), secondAccountSameNetwork: otherAccount.status, independentReset: independentReset.status }));
