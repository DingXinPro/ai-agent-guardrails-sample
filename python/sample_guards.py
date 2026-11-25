#!/usr/bin/env python3
"""AI Agent Guardrails — 2-guard sample (Python).

This single file is the public sample. It includes only:

1. Prompt Sanitizer (`InjectionGuard`) — system-prompt override, jailbreak
   phrasing, and hidden-instruction signals.
2. Token Budget Limiter (`BudgetGuard`) — a local token estimate and a
   fail-closed per-call / session cap.

It does **not** include schema validation, secret redaction, loop detection,
or tool allowlisting. Those ship in the full pack only.

Requires Python 3.10+. No third-party packages.

Usage:
    python sample_guards.py --prompt ../examples/safe_prompt.txt
    python sample_guards.py --prompt ../examples/injection_prompt.txt --max-per-call 200 --max-total 2000
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

HIDDEN_CHARS = re.compile(
    r"[\u200b\u200c\u200d\u2060\ufeff\u180e\u00ad"
    r"\u2061-\u2064\u202a-\u202e\u2066-\u2069]"
)
GAP = re.compile(r"[^\S\n]{16,}|\n{4,}")
HTML_COMMENT = re.compile(r"<!--(.*?)-->", re.DOTALL)
OVERRIDE = re.compile(
    r"(ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directions|messages)"
    r"|disregard\s+(all\s+)?(previous|prior|above|the\s+above)"
    r"|forget\s+(your|all|the)\s+(previous\s+)?(instructions|rules|guidelines|prompts)"
    r"|override\s+(the\s+)?(system|developer)\s+(prompt|instructions|rules)"
    r"|new\s+system\s+prompt"
    r"|you\s+are\s+now\s+(in\s+)?(dan|developer|god|unrestricted)(\s+mode)?"
    r"|enter\s+(developer|god|unrestricted|dan)\s+mode"
    r"|print\s+(your\s+)?(system|hidden)\s+(prompt|instructions))",
    re.IGNORECASE,
)
JAILBREAK = re.compile(
    r"(\bdo\s+anything\s+now\b|\bjailbreak\b|\bno\s+(ethical\s+)?(restrictions|guidelines|guardrails)\b"
    r"|\bwithout\s+(any\s+)?(restrictions|limits|guidelines|guardrails)\b|\bsudo\s+mode\b)",
    re.IGNORECASE,
)
WORD = re.compile(r"\S+", re.UNICODE)


def estimate_tokens(text: str) -> int:
    """Conservative local heuristic: max(ceil(chars/4), ceil(words*1.3)). Not tiktoken."""

    if not text:
        return 0
    words = WORD.findall(text)
    word_estimate = math.ceil(len(words) * 1.3) if words else 0
    return max(math.ceil(len(text) / 4), word_estimate)


@dataclass(frozen=True)
class Finding:
    guard: str
    code: str
    message: str


@dataclass(frozen=True)
class Decision:
    allowed: bool
    findings: tuple[Finding, ...] = ()
    tokens: int | None = None


class InjectionGuard:
    def inspect(self, text: str) -> Decision:
        if not text:
            return Decision(True)
        findings: list[Finding] = []
        normalized = GAP.sub(" ", HIDDEN_CHARS.sub("", text))
        hidden_count = len(HIDDEN_CHARS.findall(text))
        for corpus in (text, normalized):
            if OVERRIDE.search(corpus):
                findings.append(Finding("injection_guard", "system_prompt_override", "Detected a system-prompt override attempt."))
            if JAILBREAK.search(corpus):
                findings.append(Finding("injection_guard", "jailbreak_keyword", "Detected jailbreak or unrestricted-mode phrasing."))
        for comment in HTML_COMMENT.finditer(text):
            body = comment.group(1) or ""
            if OVERRIDE.search(body) or JAILBREAK.search(body):
                findings.append(Finding("injection_guard", "hidden_instruction", "Detected an instruction hidden inside an HTML comment."))
        if hidden_count >= 3:
            findings.append(Finding("injection_guard", "hidden_instruction", "Detected a cluster of invisible or bidi characters."))
        # unique by code+message
        unique = list({(item.code, item.message): item for item in findings}.values())
        return Decision(allowed=not unique, findings=tuple(unique))


@dataclass
class BudgetGuard:
    max_tokens_per_call: int
    max_tokens_total: int
    output_reserve: int = 256
    spent: int = 0
    _closed: bool = field(default=False, init=False, repr=False)

    def check(self, prompt: str) -> Decision:
        projected = estimate_tokens(prompt) + self.output_reserve
        findings: list[Finding] = []
        if self._closed or self.spent >= self.max_tokens_total:
            self._closed = True
            findings.append(Finding("budget_guard", "budget_exhausted", "Session budget is already exhausted."))
        elif projected > self.max_tokens_per_call:
            self._closed = True
            findings.append(Finding("budget_guard", "per_call_budget_exceeded", f"Projected {projected} tokens exceed max_tokens_per_call={self.max_tokens_per_call}."))
        elif self.spent + projected > self.max_tokens_total:
            self._closed = True
            findings.append(Finding("budget_guard", "total_budget_exceeded", f"Projected session total {self.spent + projected} exceeds max_tokens_total={self.max_tokens_total}."))
        return Decision(allowed=not findings, findings=tuple(findings), tokens=projected)


def run(prompt: str, *, max_per_call: int, max_total: int, reserve: int) -> dict[str, Any]:
    injection = InjectionGuard().inspect(prompt)
    budget = BudgetGuard(max_per_call, max_total, reserve).check(prompt)
    allowed = injection.allowed and budget.allowed
    return {
        "allowed": allowed,
        "tokens": budget.tokens,
        "findings": [
            {"guard": item.guard, "code": item.code, "message": item.message}
            for item in (*injection.findings, *budget.findings)
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="2-guard sample: prompt sanitizer + token budget limiter.")
    parser.add_argument("--prompt", required=True, help="Path to a prompt file, or - for stdin.")
    parser.add_argument("--max-per-call", type=int, default=2000)
    parser.add_argument("--max-total", type=int, default=8000)
    parser.add_argument("--reserve", type=int, default=256)
    args = parser.parse_args(argv)
    text = sys.stdin.read() if args.prompt == "-" else Path(args.prompt).read_text(encoding="utf-8")
    result = run(text, max_per_call=args.max_per_call, max_total=args.max_total, reserve=args.reserve)
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0 if result["allowed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
