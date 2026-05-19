# Nitro Pricing

MVP em monorepo TypeScript para geração assistida de orçamentos estimados de mão de obra para infraestrutura, CFTV, cabeamento, rack, nobreak, rede e manutenção.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: NestJS + TypeScript
- Banco: PostgreSQL
- ORM: Prisma
- Containers: Docker e Docker Compose
- Auth: `AUTH_MODE=local` para testes internos com login simples, `dev` para mock local e `keycloak` preparado para OIDC/JWT futuro
- Deploy atual: Docker Compose direto em VM. Traefik/Keycloak seguem previstos para etapa posterior

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

Modo local com tela de login:

```env
AUTH_MODE=local
LOCAL_AUTH_SECRET=troque-por-um-segredo-longo
LOCAL_ADMIN_USERNAME=admin
LOCAL_ADMIN_EMAIL=admin@nitro.local
LOCAL_ADMIN_PASSWORD=vgbrvx2ddm
LOCAL_ADMIN_ROLES=admin
LOCAL_USER_USERNAME=editor
LOCAL_USER_EMAIL=tecnico@nitro.local
LOCAL_USER_PASSWORD=troque-esta-senha
LOCAL_USER_ROLES=editor
```

O primeiro login administrativo padrão é `admin` / `vgbrvx2ddm`. Ao subir em VM, troque a senha no `.env` antes do primeiro uso real ou redefina pela tela **Usuários**. A senha local é persistida no banco como hash PBKDF2, nunca em texto puro.

Perfis operacionais:

- `visualizador`: consulta histórico, orçamentos e PDFs.
- `editor`: cria, edita, duplica e exporta orçamentos.
- `admin`: acesso total, incluindo usuários e AI Control Center.

Modo desenvolvimento sem login:

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

## Deploy simples em VM para testes internos

1. Instale Docker e Docker Compose na VM.
2. Clone o repositório:

```bash
git clone https://github.com/Danzera11/nitro-pricing.git
cd nitro-pricing
```

3. Crie o `.env`:

```bash
cp .env.vm.example .env
```

4. Edite obrigatoriamente:

```env
AUTH_MODE=local
LOCAL_AUTH_SECRET=<segredo-longo-aleatorio>
LOCAL_ADMIN_PASSWORD=<senha-forte>
LOCAL_USER_PASSWORD=<senha-forte>
POSTGRES_PASSWORD=<senha-forte-do-banco>
VITE_API_URL=http://IP_DA_VM:3000
WEB_ORIGIN=http://IP_DA_VM:5173
WEB_PORT=5173
API_PORT=3000
```

5. Suba a stack de VM:

```bash
docker compose -f docker-compose.vm.yml up -d --build
```

6. Aplique migrations:

```bash
docker compose -f docker-compose.vm.yml exec api npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```

7. Rode o seed inicial apenas no primeiro deploy ou quando quiser recriar dados base:

```bash
docker compose -f docker-compose.vm.yml exec api npm run prisma:seed
```

8. Acesse:

- Web: `http://IP_DA_VM:5173`
- API: `http://IP_DA_VM:3000/api`

Atalho equivalente:

```bash
sh scripts/vm-up.sh
```

Volumes persistentes:

- `powerquote_postgres`: dados do PostgreSQL
- `powerquote_api_storage`: reservado para PDFs/uploads/artefatos operacionais

Para atualizar:

```bash
git pull
sh scripts/vm-up.sh
```

Backup manual do banco:

```bash
sh scripts/vm-backup-db.sh
```

Logs:

```bash
sh scripts/vm-logs.sh
```

Observações de segurança para a VM:

- Não exponha a porta `5432` do Postgres. O override `docker-compose.vm.yml` remove o publish externo.
- Libere no firewall apenas as portas escolhidas para web/API, por padrão `5173` e `3000`.
- Troque `LOCAL_AUTH_SECRET`, `POSTGRES_PASSWORD`, `LOCAL_ADMIN_PASSWORD` e `LOCAL_USER_PASSWORD` antes de uso real.
- Para teste inicial, o usuário padrão continua `admin` / `vgbrvx2ddm`; depois redefina pela tela **Usuários**.

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
