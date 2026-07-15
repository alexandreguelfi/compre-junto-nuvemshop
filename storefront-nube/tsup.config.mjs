import { defineConfig } from "tsup";

export default defineConfig({
  bundle: true,
  clean: true,
  entry: {
    "compre-junto": "storefront-nube/src/main.ts",
  },
  esbuildOptions(options) {
    options.alias = {
      "@tiendanube/nube-sdk-jsx/dist/jsx-runtime": "@tiendanube/nube-sdk-jsx/jsx-runtime",
    };
    options.charset = "utf8";
  },
  format: ["esm"],
  minify: true,
  outDir: "public/nube",
  outExtension() {
    return {
      js: ".js",
    };
  },
  skipNodeModulesBundle: false,
  sourcemap: false,
  splitting: false,
  target: "esnext",
  tsconfig: "storefront-nube/tsconfig.json",
});
