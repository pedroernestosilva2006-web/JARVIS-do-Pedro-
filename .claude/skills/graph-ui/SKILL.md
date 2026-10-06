---
name: graph-ui
description: Padrões do grafo estilo Obsidian (Sigma.js v3 + Graphology). Use ao mexer em components/graph ou na RPC graph_snapshot.
---
# Grafo

Arquivo principal: `apps/web/components/graph/GraphView.tsx`. Dados: `GET /api/graph` → RPC `graph_snapshot`
(só id/título/tipo/estágio/grau/x/y/created_at + arestas com status/relação/rationale). Posições: `POST /api/graph`.

## Padrões
- Sigma direto (sem wrapper React), criado num `useEffect` por snapshot; `kill()` no cleanup.
- Estado de filtros/cor/hover em **refs** lidos pelos `nodeReducer`/`edgeReducer`; atualize as refs dentro de
  `useEffect` (lint `react-hooks/refs` proíbe escrever ref durante o render) e chame `refresh({ skipIndexation: true })`.
- Tamanho: `nodeSize(degree, type)` do core (`3 + 2.5·√grau`, MOC +3). Cores: `TYPE_COLORS` / `communityColor`.
- Layout: `graphology-layout-forceatlas2/worker` com `inferSettings`; ao parar, salve posições.
  Só roda automático se algum nó vier sem x/y.
- Comunidades: `graphology-communities-louvain` no client (cor) e no lint (propostas de MOC).
- Cores **opacas** (pré-misturadas com #1e1e1e): alfa em arestas WebGL varia por GPU.
- Sugestões da IA: aresta roxa (`EDGE_SUGGESTED`), com toggle; o rationale aparece no hover da aresta.

## Performance
- Até ~10 mil notas: ok com posições salvas. Para testar escala, gere nós sintéticos no banco local
  (veja o histórico do PR inicial) e meça FPS no Chromium.
- Não carregue conteúdo das notas no snapshot; abra a nota sob demanda.
