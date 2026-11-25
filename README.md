# AI Agent Guardrails & Token Budget Kit — sample

[![License: MIT](https://img.shields.io/badge/license-MIT-0f172a?style=flat-square)](LICENSE)
[![Sample](https://img.shields.io/badge/sample-2_guards-0f172a?style=flat-square)]
[![Full pack](https://img.shields.io/badge/full_pack-6_guards-334155?style=flat-square)](https://dingster13.gumroad.com)
[![Pay What You Want $0+](https://img.shields.io/badge/Gumroad-Pay_What_You_Want_%240%2B-ff90e8?style=flat-square)](https://dingster13.gumroad.com)

A 2-guard, single-file sample of **AI Agent Guardrails & Token Budget Kit**. Paste a prompt, get a fail-closed decision: is this an injection / override attempt, and would it blow a local token budget?

This sample includes **only**:

1. Prompt Sanitizer (`injection_guard`)
2. Token Budget Limiter (`budget_guard`)

It does **not** include schema validation, secret redaction, loop detection, tool allowlisting, the composable pipeline, or the full CLI. Those ship in the full pack.

November 2026 snapshot. Python 3.10+ or Node 22.6+. No third-party packages.

**Publishing status:** this README is written for a planned public sample repository that is **not created yet**: `https://github.com/DingXinPro/ai-agent-guardrails-sample`. The Full pack and Gumroad badges above point at the existing shop, [https://dingster13.gumroad.com](https://dingster13.gumroad.com), because the proposed product page `https://dingster13.gumroad.com/l/ai-agent-guardrails-kit` is **not listed yet**. Do not treat either proposed URL as live.

## Two-step quickstart

### Python

```bash
cd sample
python3 python/sample_guards.py --prompt examples/safe_prompt.txt
python3 python/sample_guards.py --prompt examples/injection_prompt.txt
```

### TypeScript

```bash
cd sample
node typescript/sample_guards.ts --prompt examples/safe_prompt.txt
node typescript/sample_guards.ts --prompt examples/injection_prompt.txt
```

A safe prompt prints `"allowed": true` and a local token estimate, then exits 0. The injection example exits 2 and reports `system_prompt_override`. You can tighten the cap with `--max-per-call`, `--max-total`, and `--reserve`.

The token figure is a conservative local heuristic (`ceil(chars/4)` vs `ceil(words*1.3)`, whichever is larger). It is not tiktoken and will not match a provider invoice exactly.

## Full pack

The full pack adds four more guards on top of these two, in both Python and TypeScript, plus unit tests and a CLI:

- `schema_guard` — JSON Schema validation with light repair (fences, trailing commas, single quotes). Pydantic v2 / Zod are optional, not required.
- `redact_guard` — emails, common API key shapes, JWTs, PEM blocks, optional custom regex
- `loop_guard` — repeated or oscillating tool/API calls
- `tool_guard` — allowlist of tool names and argument constraints (fail-closed)

Pricing, once listed, is **Pay what you want ($0+)**. Shop (live): https://dingster13.gumroad.com  
Proposed product URL (not listed yet): https://dingster13.gumroad.com/l/ai-agent-guardrails-kit

## License

MIT. Copyright (c) 2026 Xin Ding.
