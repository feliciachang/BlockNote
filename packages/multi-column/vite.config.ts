import * as path from "path";
import { webpackStats } from "rollup-plugin-webpack-stats";
import { defineConfig } from "vite";
import pkg from "./package.json";
// import eslintPlugin from "vite-plugin-eslint";

const deps = Object.keys(pkg.dependencies);

// https://vitejs.dev/config/
export default defineConfig((conf) => ({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitestSetup.ts"],
  },
  plugins: [webpackStats()],
  resolve: {
    alias:
      conf.command === "build"
        ? ({} as Record<string, string>)
        : ({
            // load live from sources with live reload working
            "@blocknote/core": path.resolve(__dirname, "../core/src/"),
          } as Record<string, string>),
  },
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "blocknote-multi-column",
      fileName: "blocknote-multi-column",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: (source: string) => {
        if (deps.includes(source)) {
          return true;
        }
        return source.startsWith("prosemirror-");
      },
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {},
        interop: "compat", // https://rollupjs.org/migration/#changed-defaults
      },
    },
  },
}));
