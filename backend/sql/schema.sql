-- Lash Studio: schema do banco (Supabase / PostgreSQL)
create schema if not exists lash_studio;
set search_path to lash_studio;

create type status_agendamento as enum ('pendente', 'confirmado', 'concluido', 'cancelado');

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null unique,
  email text,
  criado_em timestamptz not null default now()
);

create table servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  duracao_minutos int not null,
  preco numeric(10,2) not null,
  ativo boolean not null default true
);

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  servico_id uuid not null references servicos(id),
  data date not null,
  hora time not null,
  status status_agendamento not null default 'confirmado',
  codigo_confirmacao text not null,
  criado_em timestamptz not null default now()
);

-- Impede dois agendamentos ativos no mesmo horário (cancelados não bloqueiam)
create unique index uq_horario_ativo
  on agendamentos (data, hora)
  where status <> 'cancelado';

create index idx_agendamentos_data on agendamentos (data);
create index idx_agendamentos_cliente on agendamentos (cliente_id);

insert into servicos (nome, duracao_minutos, preco) values
  ('Extensão Volume Russo', 120, 180.00),
  ('Manutenção', 60, 90.00),
  ('Design de Sobrancelha', 40, 60.00);

-- Permissões para o backend
grant usage on schema lash_studio to service_role;
grant all on all tables in schema lash_studio to service_role;
grant all on all sequences in schema lash_studio to service_role;
alter default privileges in schema lash_studio grant all on tables to service_role;

-- =========================================================
-- PARTE 3 (rodar no Supabase depois): view analítica e RLS
-- =========================================================
create or replace view vw_fato_agendamentos
with (security_invoker = true) as
select
  a.id                          as agendamento_id,
  a.status,
  a.data                        as data_agendamento,
  extract(dow from a.data)      as dia_da_semana,
  extract(month from a.data)    as mes,
  extract(year from a.data)     as ano,
  a.hora,
  c.id                          as cliente_id,
  c.nome                        as cliente_nome,
  s.id                          as servico_id,
  s.nome                        as servico_nome,
  s.preco                       as valor,
  1                             as quantidade
from agendamentos a
join clientes c on c.id = a.cliente_id
join servicos s on s.id = a.servico_id;

grant select on vw_fato_agendamentos to service_role;

alter table clientes     enable row level security;
alter table servicos     enable row level security;
alter table agendamentos enable row level security;
