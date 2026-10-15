# Lash Studio — Agendador de Serviços para MEI

Sistema web de agendamento de serviços desenvolvido como projeto
acadêmico (Uninove), aplicado a um caso real: uma profissional
autônoma (MEI) de lash designer. Toda a stack utiliza apenas
ferramentas com plano gratuito.

## Estrutura do repositório

```
lash-studio-agendador/
├── backend/    → API em Node.js + Express, conectada ao Supabase (PostgreSQL)
├── frontend/   → Interface web em HTML, CSS e JavaScript
└── docs/       → Documentos do projeto
```

## Escopo funcional

| Área | Telas | Autenticação |
|---|---|---|
| Cliente | Agendamento · Consulta/cancelamento | Sem login (telefone + código de confirmação) |
| Lash designer | Login · Agenda do dia · Painel executivo | Login via Supabase Auth |

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS, JavaScript |
| Back-end | Node.js + Express |
| Banco de dados | Supabase (PostgreSQL) |
| Autenticação | Supabase Auth |
| Gráficos | Chart.js |
| Modelagem (DER/MER) | draw.io |
| Hospedagem front-end | Vercel |
| Hospedagem back-end | Render |
| Disponibilidade | UptimeRobot |
| Testes de API | Postman |

## Equipe

Projeto desenvolvido em grupo de 4 pessoas para a disciplina de
Projeto de Extensão de Desenvolvimento de Sistemas de Informação.
