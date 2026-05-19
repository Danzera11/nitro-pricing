# PowerQuote AI - Arquitetura e Decisões da Primeira Rodada

## Objetivo desta rodada

Criar um MVP funcional, navegável e preparado para evolução, priorizando:

- Monorepo TypeScript com `apps/web`, `apps/api` e `packages/shared`.
- Backend NestJS modular com autenticação pronta para Keycloak e modo local mockado.
- Prisma/PostgreSQL com entidades centrais do domínio.
- Frontend SaaS B2B limpo, com sidebar, topbar, dashboard, cadastros, geração por IA e grid editável.
- Docker Compose com Postgres, API, web e Redis opcional.

## Pensamento arquitetural

O produto é parte de uma plataforma maior, então evitei acoplar autenticação, IA ou deploy a uma solução local definitiva. O backend é a fonte de verdade para permissões, auditoria e geração. O frontend apenas consome a API e nunca recebe segredo de IA.

A IA foi desenhada como serviço de aplicação (`AiService`) e não como lógica de tela. Isso permite trocar mock por OpenAI ou outro provedor sem mudar o contrato principal. Todo retorno é salvo em `AiRun`, preservando rastreabilidade.

O motor de regras inicial (`RuleEngineService`) aplica condições JSON simples e retorna sugestões de grupos, materiais e notas. Ele é propositalmente pequeno nesta rodada, mas já separa regra de negócio de controllers.

## Decisões tomadas

1. `AUTH_MODE=dev` cria/atualiza um usuário externo local com roles definidas por `.env`.
2. `AUTH_MODE=keycloak` valida JWT pelo JWKS do realm informado em `KEYCLOAK_ISSUER_URL`.
3. Roles aceitas: `admin`, `tecnico`, `comercial`, `gestor`.
4. Cadastros importantes registram eventos no `AuditLog`.
5. Materiais sugeridos não têm preço no schema.
6. O orçamento foca em mão de obra por `QuoteItem`.
7. O grid recalcula total do item e total do orçamento no backend.
8. O Dockerfile da API roda `prisma migrate deploy` na inicialização do container.
9. O seed inclui grupos, serviços, materiais, variáveis, regra exemplo, cliente exemplo e usuário dev.

## Módulos backend

- `AuthModule`: autenticação dev/Keycloak, JWT e roles.
- `UsersModule`: usuário atual e listagem.
- `CustomersModule`: clientes.
- `GroupsModule`: grupos de serviço.
- `ServicesModule`: serviços com preço de mão de obra base.
- `SuggestedMaterialsModule`: materiais sugeridos sem preço.
- `VariablesModule`: variáveis de entrada para regras e IA.
- `RulesModule`: regras JSON.
- `QuoteRequestsModule`: solicitações e gatilho de IA.
- `QuotesModule`: orçamento e grid editável.
- `AiModule`: geração de draft e persistência em `AiRun`.
- `AuditModule`: histórico/auditoria.

## Telas frontend

- Dashboard
- Solicitações de orçamento
- Nova solicitação
- Grid editável de orçamento
- Cadastro de grupos
- Cadastro de serviços
- Cadastro de materiais sugeridos
- Cadastro de variáveis
- Cadastro de regras
- Histórico/Auditoria

## Próximos passos recomendados

1. Adicionar testes unitários para `RuleEngineService`, `AiService` e guards.
2. Trocar CRUD genérico por services específicos onde regras de domínio crescerem.
3. Implementar cliente OpenAI real com timeout, schema validation e retries controlados.
4. Adicionar migrations versionadas após validar o schema em banco local.
5. Integrar Keycloak no frontend com fluxo OIDC e envio do Bearer token.
6. Criar permissões finas por ação quando o MVP virar produto multi-tenant.
7. Adicionar paginação/filtros em tabelas.
8. Adicionar importação/exportação de orçamento e trilha de aprovação comercial.
