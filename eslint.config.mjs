import js from "@eslint/js";
import globals from "globals";
import tsPlugin from "@typescript-eslint/eslint-plugin";

// typescript-eslint's flat/recommended sub-configs only restrict `files` where it
// actually matters (e.g. eslint-recommended); fall back to **/*.ts for the rest so
// they don't apply to the plain .mjs config scripts in this repo.
const tsRecommended = tsPlugin.configs["flat/recommended"].map((config) => ({
	...config,
	files: config.files ?? ["**/*.ts"],
}));

export default [
	{
		ignores: ["node_modules/**", "main.js"],
	},
	{
		languageOptions: {
			sourceType: "module",
			globals: {
				...globals.node,
			},
		},
	},
	js.configs.recommended,
	...tsRecommended,
	{
		files: ["**/*.ts"],
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", {"args": "none"}],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
		},
	},
];
