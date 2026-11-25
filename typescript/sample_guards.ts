#!/usr/bin/env node
/**
 * AI Agent Guardrails — 2-guard sample (TypeScript).
 *
 * This single file is the public sample. It includes only:
 * 1. Prompt Sanitizer (InjectionGuard)
 * 2. Token Budget Limiter (BudgetGuard)
 *
 * It does not include schema validation, secret redaction, loop detection,
 * or tool allowlisting. Those ship in the full pack only.
 *
 * Requires Node 22.6+ (runs .ts directly). No npm packages.
 *
 *   node sample_guards.ts --prompt ../examples/safe_prompt.txt
 *   node sample_guards.ts --prompt ../examples/injection_prompt.txt --max-per-call 200 --max-total 2000
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HIDDEN_CHARS = /[\u200b\u200c\u200d\u2060\ufeff\u180e\u00ad\u2061-\u2064\u202a-\u202e\u2066-\u2069]/g;
const GAP = /[^\S\n]{16,}|\n{4,}/g;
const HTML_COMMENT = /<!--(.*?)-->/gs;
const OVERRIDE =
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directions|messages)|disregard\s+(all\s+)?(previous|prior|above|the\s+above)|forget\s+(your|all|the)\s+(previous\s+)?(instructions|rules|guidelines|prompts)|override\s+(the\s+)?(system|developer)\s+(prompt|instructions|rules)|new\s+system\s+prompt|you\s+are\s+now\s+(in\s+)?(dan|developer|god|unrestricted)(\s+mode)?|enter\s+(developer|god|unrestricted|dan)\s+mode|print\s+(your\s+)?(system|hidden)\s+(prompt|instructions)/gi;
const JAILBREAK =
  /\bdo\s+anything\s+now\b|\bjailbreak\b|\bno\s+(ethical\s+)?(restrictions|guidelines|guardrails)\b|\bwithout\s+(any\s+)?(restrictions|limits|guidelines|guardrails)\b|\bsudo\s+mode\b/gi;
const WORD = /\S+/gu;

export type Finding = { guard: string; code: string; message: string };
export type Decision = { allowed: boolean; findings: Finding[]; tokens?: number };

/** Conservative local heuristic: max(ceil(chars/4), ceil(words*1.3)). Not tiktoken. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.match(WORD) ?? [];
  const wordEstimate = words.length ? Math.ceil(words.length * 1.3) : 0;
  return Math.max(Math.ceil([...text].length / 4), wordEstimate);
}

export function inspectPrompt(text: string): Decision {
  if (!text) return { allowed: true, findings: [] };
  const findings: Finding[] = [];
  const normalized = text.replace(HIDDEN_CHARS, "").replace(GAP, " ");
  const hiddenCount = (text.match(HIDDEN_CHARS) ?? []).length;
  HIDDEN_CHARS.lastIndex = 0;
  for (const corpus of [text, normalized]) {
    OVERRIDE.lastIndex = 0;
    JAILBREAK.lastIndex = 0;
    if (OVERRIDE.test(corpus)) {
      findings.push({
        guard: "injection_guard",
        code: "system_prompt_override",
        message: "Detected a system-prompt override attempt.",
      });
    }
    if (JAILBREAK.test(corpus)) {
      findings.push({
        guard: "injection_guard",
        code: "jailbreak_keyword",
        message: "Detected jailbreak or unrestricted-mode phrasing.",
      });
    }
  }
  HTML_COMMENT.lastIndex = 0;
  let comment: RegExpExecArray | null;
  while ((comment = HTML_COMMENT.exec(text)) !== null) {
    const body = comment[1] ?? "";
    OVERRIDE.lastIndex = 0;
    JAILBREAK.lastIndex = 0;
    if (OVERRIDE.test(body) || JAILBREAK.test(body)) {
      findings.push({
        guard: "injection_guard",
        code: "hidden_instruction",
        message: "Detected an instruction hidden inside an HTML comment.",
      });
    }
  }
  if (hiddenCount >= 3) {
    findings.push({
      guard: "injection_guard",
      code: "hidden_instruction",
      message: "Detected a cluster of invisible or bidi characters.",
    });
  }
  const unique = [...new Map(findings.map((item) => [`${item.code}|${item.message}`, item])).values()];
  return { allowed: unique.length === 0, findings: unique };
}

export function checkBudget(
  prompt: string,
  maxTokensPerCall: number,
  maxTokensTotal: number,
  outputReserve = 256,
): Decision {
  const projected = estimateTokens(prompt) + outputReserve;
  if (projected > maxTokensPerCall) {
    return {
      allowed: false,
      tokens: projected,
      findings: [
        {
          guard: "budget_guard",
          code: "per_call_budget_exceeded",
          message: `Projected ${projected} tokens exceed max_tokens_per_call=${maxTokensPerCall}.`,
        },
      ],
    };
  }
  if (projected > maxTokensTotal) {
    return {
      allowed: false,
      tokens: projected,
      findings: [
        {
          guard: "budget_guard",
          code: "total_budget_exceeded",
          message: `Projected session total ${projected} exceeds max_tokens_total=${maxTokensTotal}.`,
        },
      ],
    };
  }
  return { allowed: true, tokens: projected, findings: [] };
}

export function run(
  prompt: string,
  options: { maxPerCall: number; maxTotal: number; reserve: number },
): { allowed: boolean; tokens?: number; findings: Finding[] } {
  const injection = inspectPrompt(prompt);
  const budget = checkBudget(prompt, options.maxPerCall, options.maxTotal, options.reserve);
  return {
    allowed: injection.allowed && budget.allowed,
    tokens: budget.tokens,
    findings: [...injection.findings, ...budget.findings],
  };
}

function flag(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

export function main(argv = process.argv.slice(2)): number {
  const promptPath = flag(argv, "--prompt");
  if (!promptPath) {
    process.stderr.write(
      "Usage: node sample_guards.ts --prompt <file|-> [--max-per-call N] [--max-total N] [--reserve N]\n",
    );
    return 1;
  }
  const text = promptPath === "-" ? readFileSync(0, "utf8") : readFileSync(promptPath, "utf8");
  const result = run(text, {
    maxPerCall: Number(flag(argv, "--max-per-call", "2000")),
    maxTotal: Number(flag(argv, "--max-total", "8000")),
    reserve: Number(flag(argv, "--reserve", "256")),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.allowed ? 0 : 2;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  process.exit(main());
}
