# Backend — Lash Studio

API em Node.js + Express conectada ao Supabase (PostgreSQL).

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha URL e chave do Supabase e o e-mail da profissional
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
| GET | /api/admin/servicos | login da profissional |
| POST | /api/admin/servicos | login da profissional |
| PUT | /api/admin/servicos/:id | login da profissional (cria nova versão) |
| PATCH | /api/admin/servicos/:id/ativo | login da profissional (desativar/reativar) |
| GET | /api/admin/horarios | login da profissional (semana, datas especiais e avisos) |
| PUT | /api/admin/horarios/semana/:dia | login da profissional (0 = domingo … 6 = sábado) |
| PUT | /api/admin/horarios/data/:data | login da profissional (data especial; recusa se houver agendamento fora do horário) |
| DELETE | /api/admin/horarios/data/:data | login da profissional (volta ao horário da semana) |
| GET | /api/admin/agendamentos?de=&ate=&status= | login da profissional (todos os agendamentos) |

## Banco de dados

Execute `sql/schema.sql` no SQL Editor do Supabase para criar o schema `lash_studio`
(tabelas, índice único de horário, view `vw_fato_agendamentos` e serviços iniciais).
