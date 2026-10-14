const { defineConfig } = require("eslint/config");
const js = require("@eslint/js");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = defineConfig([
  { ignores: ["dist/**", "coverage/**", ".codex/**"] },
  {
    files: ["src/**/*.{js,ts,tsx}", "test/**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended, typescriptEslint.configs["flat/recommended"]],
    languageOptions: {
      globals: { ...globals.browser, ...globals.commonjs },
    },
  },
  {
    files: ["test/**/*.{js,ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
  prettier,
]);
