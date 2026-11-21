# Lash Studio — Agendador de Serviços para MEI

Sistema web de agendamento desenvolvido como Projeto de Extensão (Uninove),
aplicado a um caso real: uma profissional autônoma (MEI) de lash designer.
Toda a stack usa apenas ferramentas com plano gratuito.

**Sistema no ar:** https://lashstudio-agendador.vercel.app
**API:** https://lash-studio-backend.onrender.com/api/health

> A API fica em hospedagem gratuita e "dorme" quando está sem uso; a primeira
> requisição depois de um tempo parado pode levar cerca de 1 minuto.

## Estrutura do repositório

```
├── backend/    → API em Node.js + Express, conectada ao Supabase (PostgreSQL)
│   └── sql/    → schema.sql (tabelas, índices, view e dados iniciais)
└── frontend/   → Interface web em HTML, CSS e JavaScript (módulos ES, sem build)
```

## Funcionalidades

**Cliente (sem login)**
- Agendar escolhendo serviço, data e horário (só aparecem horários realmente livres).
- Receber um código de confirmação de 4 caracteres.
- Consultar, cancelar ou trocar o horário usando telefone + código.

**Lash designer (com login)**
- Agenda do dia com os dados da cliente e atalho para WhatsApp; altera o status do atendimento.
- Painel executivo: faturamento realizado, pendente e cancelado, atendimentos, ranking de serviços.
- Gestão de serviços: criar, editar (nome, duração, preço), desativar e reativar.

## Regras de negócio

| Regra | Valor |
|---|---|
| Antecedência mínima para agendar | 2 horas |
| Cancelar/trocar horário (cliente) | até 4 horas antes |
| Agendamentos ativos por telefone | no máximo 2 |
| Janela de agendamento | até o mesmo dia do mês seguinte, menos 1 dia |
| Funcionamento | Seg–Sex 09h–18h · Sáb 09h–14h · Dom fechado |
| Horários de início | 09:00, 10:00, 11:30, 13:00, 14:00, 15:30, 16:00, 17:00 |
| Término | o serviço precisa terminar até o horário de fechar |
| Conflito de horário | não é possível duas reservas ativas se sobrepondo |
| Status inicial | novo agendamento já nasce `confirmado` |

As regras ficam num único bloco em `backend/src/regras.js`.

## Segurança

- Área da profissional protegida por login (Supabase Auth); a API valida o token
  e só aceita os e-mails listados em `PROFISSIONAL_EMAIL`.
- A chave `service_role` do Supabase fica só no back-end (nunca no front-end).
- Row Level Security habilitado nas tabelas; o acesso passa pela API.
- Limite de tentativas por IP e por telefone na consulta/cancelamento, e limite de
  criação de agendamentos por IP.
- Índice único parcial no banco impede dois agendamentos ativos no mesmo dia/hora.

## Versionamento de serviços

Ao editar um serviço (nome, duração ou preço), o sistema cria uma **nova versão**
e desativa a anterior. Agendamentos já feitos continuam ligados à versão antiga,
preservando histórico e valores. Por isso, **não altere preços direto na tabela do
Supabase**: use a tela de Serviços.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS, JavaScript (roteador por hash) |
| Back-end | Node.js + Express |
| Banco de dados | Supabase (PostgreSQL, schema `lash_studio`) |
| Autenticação | Supabase Auth |
| Gráficos | Chart.js |
| Hospedagem front-end | Vercel |
| Hospedagem back-end | Render |
| Disponibilidade | UptimeRobot (chama `/api/health`) |

## Variáveis de ambiente (back-end)

Veja `backend/.env.example`. No Render: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`FRONTEND_URL` e `PROFISSIONAL_EMAIL`.

## Equipe

Grupo de 4 pessoas — Projeto de Extensão de Desenvolvimento de Sistemas de Informação.
