import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Inline parts are structured data: render React elements, never HTML strings.
      "react/no-danger": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/font/google",
              message:
                "Fonts are self-hosted (offline after npm ci): use next/font/local or @fontsource-variable/*.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next*/**",
    "out/**",
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
])
