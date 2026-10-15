# Backend — Lash Studio

API em Node.js + Express conectada ao Supabase (PostgreSQL).

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha com a URL e a chave secreta do Supabase
npm run dev
```

## Rotas

| Método | Rota | Acesso |
|---|---|---|
| GET | /api/health | público |
| GET | /api/servicos | público |
| GET | /api/agendamentos/horarios?data= | público |
| POST | /api/agendamentos | público |
| GET | /api/agendamentos/consulta?telefone=&codigo= | público |
| PATCH | /api/agendamentos/:id/cancelar | público (telefone + código) |
| PATCH | /api/agendamentos/:id/reagendar | público (telefone + código) |
| GET | /api/admin/agenda?data= | login da profissional |
| PATCH | /api/admin/agendamentos/:id/status | login da profissional |
| GET | /api/admin/dashboard?inicio=&fim= | login da profissional |
