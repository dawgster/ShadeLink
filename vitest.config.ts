import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

dotenv.config({ path: ".env.development.local" });

export default defineConfig({
  test: {
    deps: {
      inline: ["chainsig.js"],
    },
  },
  ssr: {
    noExternal: ["chainsig.js"],
  },
});
