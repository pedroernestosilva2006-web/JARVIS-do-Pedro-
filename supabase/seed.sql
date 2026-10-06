-- Seed de desenvolvimento: 1 workspace com um evento, um livro, pessoas e insights conectados.
-- Depois de criar seu usuário local (supabase/auth), associe-o:
--   insert into workspace_members (workspace_id, user_id) values ('00000000-0000-0000-0000-000000000001', '<seu auth.users.id>');

insert into public.workspaces (id, name, profile_md) values
  ('00000000-0000-0000-0000-000000000001', 'Cérebro do Pedro (seed)',
   'Pedro Ernesto — empreendedor, especialista em IA aplicada a vendas B2B. Prefere respostas diretas, em PT-BR.');

with ws as (select '00000000-0000-0000-0000-000000000001'::uuid as id),
n(slug, type, title, summary, properties, para) as (values
  ('rd-summit-2026', 'evento', 'RD Summit 2026', 'Maior evento de marketing e vendas da América Latina.', '{"data":"2026-09-24","local":"Florianópolis"}', 'recurso'),
  ('receita-previsivel', 'livro', 'Receita Previsível', 'Livro sobre outbound e especialização de funções em vendas.', '{"autor":"Aaron Ross","status_leitura":"lido"}', 'recurso'),
  ('spin-selling', 'livro', 'SPIN Selling', 'Método de perguntas Situação, Problema, Implicação e Necessidade.', '{"autor":"Neil Rackham","status_leitura":"lendo"}', 'recurso'),
  ('aaron-ross', 'pessoa', 'Aaron Ross', 'Autor de Receita Previsível; criou o modelo de outbound da Salesforce.', '{}', 'recurso'),
  ('neil-rackham', 'pessoa', 'Neil Rackham', 'Pesquisador de vendas, autor de SPIN Selling.', '{}', 'recurso'),
  ('outbound', 'conceito', 'Outbound', 'Prospecção ativa de clientes.', '{}', 'area'),
  ('cadencia', 'conceito', 'Cadência de prospecção', 'Sequência planejada de toques multicanal.', '{}', 'area'),
  ('sdr-ia-clinicas', 'projeto', 'SDR de IA para clínicas', 'Produto: agente de IA que qualifica leads de clínicas.', '{"status":"ativo"}', 'projeto'),
  ('i-cadencia-8', 'insight', 'Cadência de 8 toques supera 3 toques em outbound B2B', 'A maioria das respostas vem depois do 4º toque.', '{}', 'area'),
  ('i-especializacao', 'insight', 'Especializar SDR, closer e CS aumenta previsibilidade', 'Separar funções cria métricas claras por etapa.', '{}', 'area'),
  ('i-objecao-preco', 'insight', 'Objeção de preço esconde objeção de valor', 'Quando o cliente fala de preço, faltou implicação.', '{}', 'area'),
  ('i-implicacao', 'insight', 'Perguntas de implicação aumentam o valor percebido', 'Fazer o cliente verbalizar o custo do problema.', '{}', 'area'),
  ('i-ia-primeiro-toque', 'insight', 'IA personaliza o primeiro toque em escala', 'Pesquisa automática do lead antes do e-mail.', '{}', 'area'),
  ('ideia-roteiro-webinar', 'ideia', 'Webinar: outbound com IA para clínicas', 'Conteúdo para atrair clínicas para o SDR de IA.', '{}', 'projeto'),
  ('moc-prospeccao', 'moc', 'MOC: Prospecção Outbound', 'Mapa das notas sobre prospecção.', '{}', 'area')
)
insert into public.notes (workspace_id, slug, type, title, summary, properties, para_bucket, stage, created_by)
select ws.id, n.slug, n.type, n.title, n.summary, n.properties::jsonb, n.para, 'broto', 'user' from n, ws;

with ws as (select '00000000-0000-0000-0000-000000000001'::uuid as id),
e(a, b, rel) as (values
  ('aaron-ross', 'receita-previsivel', 'autor_de'),
  ('neil-rackham', 'spin-selling', 'autor_de'),
  ('aaron-ross', 'rd-summit-2026', 'palestrante_em'),
  ('i-cadencia-8', 'rd-summit-2026', 'aprendido_em'),
  ('i-ia-primeiro-toque', 'rd-summit-2026', 'aprendido_em'),
  ('i-especializacao', 'receita-previsivel', 'aprendido_em'),
  ('i-objecao-preco', 'spin-selling', 'aprendido_em'),
  ('i-implicacao', 'spin-selling', 'aprendido_em'),
  ('i-objecao-preco', 'i-implicacao', 'apoia'),
  ('i-cadencia-8', 'cadencia', 'menciona'),
  ('i-cadencia-8', 'outbound', 'menciona'),
  ('i-especializacao', 'outbound', 'menciona'),
  ('i-ia-primeiro-toque', 'sdr-ia-clinicas', 'inspira'),
  ('ideia-roteiro-webinar', 'sdr-ia-clinicas', 'parte_de'),
  ('i-cadencia-8', 'moc-prospeccao', 'parte_de'),
  ('i-especializacao', 'moc-prospeccao', 'parte_de'),
  ('i-ia-primeiro-toque', 'moc-prospeccao', 'parte_de'),
  ('cadencia', 'moc-prospeccao', 'parte_de')
)
insert into public.links (workspace_id, from_note, to_note, relation, origin, status)
select ws.id, f.id, t.id, e.rel, 'manual', 'accepted'
from e, ws
join public.notes f on f.workspace_id = ws.id
join public.notes t on t.workspace_id = ws.id
where f.slug = e.a and t.slug = e.b;

-- Uma sugestão da IA (tracejada no grafo, pendente na Inbox)
insert into public.links (workspace_id, from_note, to_note, relation, origin, status, confidence, rationale)
select n1.workspace_id, n1.id, n2.id, 'relacionado', 'ai_semantic', 'suggested', 0.74,
       'Ambos tratam de aumentar a taxa de resposta no início do funil.'
from public.notes n1, public.notes n2
where n1.slug = 'i-ia-primeiro-toque' and n2.slug = 'i-cadencia-8'
  and n1.workspace_id = '00000000-0000-0000-0000-000000000001' and n2.workspace_id = n1.workspace_id;
