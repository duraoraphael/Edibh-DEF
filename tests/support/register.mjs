// Loaded via `node --import ./tests/support/register.mjs` before any test
// file's imports run, so the "@/*" alias hook in alias-loader.mjs is active
// for the whole process. See alias-loader.mjs for why this is needed.
import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
