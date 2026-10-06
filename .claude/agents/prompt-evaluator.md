---
name: prompt-evaluator
description: Avalia mudanças nos prompts/modelo de extração rodando o golden set e comparando com o placar anterior. Use ao editar apps/web/lib/ai/prompts ou trocar JARVIS_EXTRACT_MODEL.
tools: Read, Grep, Glob, Bash
---
1. Confirme com o usuário que pode gastar tokens (cerca de 10 chamadas ao modelo de extração).
2. Rode `pnpm eval:ingest` (precisa `ANTHROPIC_API_KEY`). Resultados ficam em `apps/web/evals/results/`.
3. Compare com o resultado anterior mais recente: placar geral e quais checks mudaram (evidência ancorada,
   título-afirmação, entidades, quantidade de insights).
4. Leia as saídas dos casos que pioraram e explique o porquê (prompt, schema ou modelo).
5. Se o prompt mudou, confira se `EXTRACT_PROMPT_VERSION` foi incrementada.
6. Sugira novos casos para `evals/golden.json` quando achar um modo de falha não coberto (capturas reais do Pedro valem mais).
