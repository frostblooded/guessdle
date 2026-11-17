import type { Rule } from "eslint";

declare const plugin: { rules: Record<string, Rule.RuleModule> };
export default plugin;
