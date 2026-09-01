This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Testes

`npm test` runs unit tests, the Firestore/Storage security rules suite against the real Firebase Emulator (`tests/firestore-rules.test.ts`, `tests/storage-rules.test.ts`), and Playwright. The rules suite needs a JDK on `PATH` (the emulator is JVM-based) — install one (e.g. Temurin 21) if `npm run test:rules` fails with "could not spawn `java -version`". Everything else has no such requirement.

## Dependências

`xlsx` is installed straight from SheetJS's own CDN (`https://cdn.sheetjs.com/...`) instead of the npm registry — this is the upstream maintainer's own documented distribution channel (the `xlsx` npm package was pulled by its author). package.json pins the exact version in the URL itself (no floating range) and package-lock.json records a SHA-512 integrity hash for the tarball, so `npm install` verifies it hasn't changed. Because it isn't a registry package, some SCA tools that only scan npm-resolved dependencies may not see it — check `npm audit` output for it manually on every SheetJS version bump, and re-pin the URL (and let the lockfile hash update) rather than widening it to a range.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
