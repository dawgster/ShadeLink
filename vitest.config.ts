import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "vitest/config";

dotenv.config({ path: ".env.development.local" });

export default defineConfig({
  test: {
    deps: {
      inline: ["chainsig.js", "cosmjs-types"],
    },
  },
  resolve: {
    alias: {
      "cosmjs-types/cosmos/tx/signing/v1beta1/signing": path.resolve(
        __dirname,
        "src/shims/cosmjs-signing.ts",
      ),
      "cosmjs-types/cosmos/tx/v1beta1/tx": path.resolve(
        __dirname,
        "src/shims/cosmjs-tx.ts",
      ),
    },
  },
  ssr: {
    noExternal: ["chainsig.js", "cosmjs-types"],
  },
});
