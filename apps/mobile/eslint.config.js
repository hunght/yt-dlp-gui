const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: ["node_modules/**", "android/**", ".expo/**", "dist-apk/**"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression[typeAnnotation.type='TSAnyKeyword'], TSTypeAssertion[typeAnnotation.type='TSAnyKeyword']",
          message:
            "Do not use 'as any'. Prefer proper typing, narrowing, or validation.",
        },
        {
          selector:
            "TSAsExpression[typeAnnotation.type='TSUnknownKeyword'], TSTypeAssertion[typeAnnotation.type='TSUnknownKeyword']",
          message:
            "Do not cast to unknown as a type escape hatch. Prefer runtime validation or a dedicated type guard.",
        },
      ],
    },
  },
];
