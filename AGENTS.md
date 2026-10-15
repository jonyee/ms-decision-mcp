# Agent guidance

## Decision tool

Consider `mcp__decision__decide` when comparing candidate approaches, classifying or routing an issue, prioritizing work, or grading an output against explicit qualitative criteria. Use it when relevant evidence and bounded answer options are available, not for every task.

Supply relevant evidence, define clear criteria, and batch related questions. Include an `unknown` or `abstain` choice when evidence may be insufficient. Do not submit secrets or unnecessary sensitive data.

Prefer a compiler, test, linter, or deterministic rule for checks those tools can resolve. Decision results are model judgments, not verified facts or authorization to act. Escalate uncertain or high-impact decisions for review. If the tool is unavailable, continue with appropriate alternatives and do not claim it was used.

## Validation

Run `npm run check`, `npm test`, and `npm run build` after changes. `npm run test:live` is an opt-in Azure inference test, not part of routine offline validation.
