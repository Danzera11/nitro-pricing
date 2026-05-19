# Nitro Pricing

MVP em monorepo TypeScript para geração assistida de orçamentos estimados de mão de obra para infraestrutura, CFTV, cabeamento, rack, nobreak, rede e manutenção.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: NestJS + TypeScript
- Banco: PostgreSQL
- ORM: Prisma
- Containers: Docker e Docker Compose
- Auth: camada JWT/OIDC pronta para Keycloak, com `AUTH_MODE=dev` para desenvolvimento local
- Deploy previsto atrás de Traefik externo

## Estrutura

```text
powerquote-ai/
  apps/
    web/
    api/
  packages/
    shared/
  docker/
  docker-compose.yml
  .env.example
  ARQUITETURA_E_DECISOES.md
```

## Rodando local com Docker

1. Crie o `.env`:

```bash
cp .env.example .env
```

2. Suba os containers:

```bash
docker compose up --build
```

3. Em outro terminal, rode o seed:

```bash
docker compose exec api npm run prisma:seed
```

4. Acesse:

- Web: <http://localhost:5173>
- API: <http://localhost:3000/api>

## Rodando local sem Docker

```bash
npm install
npm run build -w @powerquote/shared
cd apps/api
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

Em outro terminal:

```bash
npm run dev -w @powerquote/web
```

Se o PostgreSQL estiver fora do Docker, ajuste `DATABASE_URL`.

## Prisma

O schema está em `apps/api/prisma/schema.prisma`.

Com Docker, o container da API executa:

```bash
npx prisma migrate deploy
```

Para criar uma migration em desenvolvimento:

```bash
npm run prisma:migrate -w @powerquote/api
```

## Autenticação

Modo local:

```env
AUTH_MODE=dev
DEV_USER_ROLES=admin,tecnico,comercial,gestor
```

Modo Keycloak/OIDC:

```env
AUTH_MODE=keycloak
KEYCLOAK_ISSUER_URL=https://keycloak.example.com/realms/powerquote
KEYCLOAK_AUDIENCE=powerquote-api
```

O backend valida JWT via JWKS do issuer e aplica roles no servidor com `RolesGuard`.

## IA

`AiService.generateQuoteDraft()` salva todo resultado em `AiRun`.

Quando `OPENAI_API_KEY` está vazio, retorna um mock realista baseado nos cadastros e regras. Quando existir chave, a estrutura já isola a chamada no backend para plugar o provedor LLM sem expor segredo no frontend.

## Endpoints principais

- `GET /api/users/me`
- `GET/POST/PATCH/DELETE /api/customers`
- `GET/POST/PATCH/DELETE /api/groups`
- `GET/POST/PATCH/DELETE /api/services`
- `GET/POST/PATCH/DELETE /api/suggested-materials`
- `GET/POST/PATCH/DELETE /api/variables`
- `GET/POST/PATCH/DELETE /api/rules`
- `GET/POST/PATCH /api/quote-requests`
- `POST /api/quote-requests/:id/generate-ai`
- `GET /api/quotes/:id`
- `PATCH /api/quotes/:quoteId/items/:itemId`
- `GET /api/audit`

## Traefik

O `docker-compose.yml` contém labels preparadas por variável:

```env
TRAEFIK_ENABLE=true
POWERQUOTE_WEB_HOST=powerquote.seudominio.com
POWERQUOTE_API_HOST=api.powerquote.seudominio.com
```

Em produção, conecte os serviços à network externa usada pelo Traefik existente.
