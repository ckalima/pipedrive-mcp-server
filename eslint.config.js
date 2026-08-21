import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    // `coverage/` is gitignored local output from `npm run test:coverage`, but it holds
    // instrumented copies of src that eslint would otherwise walk once the lint scope
    // widened from `src/` to the whole tree.
    ignores: ["dist/", "node_modules/", "bundle/", "coverage/"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
