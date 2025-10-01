// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked[1].rules,
      // Ajustes útiles
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  prettier, // desactiva reglas que chocan con Prettier
];
