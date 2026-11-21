const express = require("express");
const supabase = require("../supabaseClient");
const svc = require("../services/agendamento.service");
const { exigirLogin } = require("../middleware/auth");

const router = express.Router();

// Data de hoje no fuso do Brasil (toISOString usaria UTC e erraria o dia após as 21h)
const hojeBrasil = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// Todas as rotas abaixo exigem um token válido da lash designer
router.use(exigirLogin);

// GET /api/admin/agenda?data=2026-11-10
router.get("/agenda", async (req, res) => {
  const data = req.query.data || hojeBrasil();

  const { data: agendamentos, error } = await supabase
    .from("agendamentos")
    .select("*, servicos(nome, preco, duracao_minutos), clientes(nome, telefone)")
    .eq("data", data)
    .order("hora", { ascending: true });

  if (error) { console.error(error.message); return res.status(500).json({ erro: "Erro interno no servidor." }); }
  res.json(agendamentos);
});

// PATCH /api/admin/agendamentos/:id/status   { status }
router.patch("/agendamentos/:id/status", async (req, res) => {
  const { status } = req.body;
  const validos = ["pendente", "confirmado", "concluido", "cancelado"];

  if (!validos.includes(status)) {
    return res.status(400).json({ erro: `Status inválido. Use um de: ${validos.join(", ")}` });
  }

  try {
    const atualizado = await svc.atualizarStatus(req.params.id, status);
    res.json(atualizado);
  } catch (err) {
    if (!err.status) console.error("Erro ao atualizar status:", err.message);
    res.status(err.status || 500).json({ erro: err.status ? err.message : "Erro interno no servidor." });
  }
});

// ---------- Serviços (cadastro feito pela profissional) ----------
// Regra de ouro: o passado não muda. Editar nome, duração ou preço cria uma NOVA versão
// do serviço e desativa a antiga. Agendamentos já feitos continuam ligados à versão antiga,
// então mantêm o valor, a duração e o nome da época. Só ativar/desativar altera o registro.

const erroServico = (res, status, erro) => res.status(status).json({ erro });

// Confere e limpa os dados vindos do formulário. Devolve { dados } ou { erro }.
function validarServico(corpo) {
  const nome = String(corpo?.nome ?? "").trim().replace(/\s+/g, " ");
  const duracao = Number(corpo?.duracao_minutos);
  const preco = Number(corpo?.preco);

  if (nome.length < 2 || nome.length > 60) return { erro: "O nome precisa ter entre 2 e 60 caracteres." };
  if (!Number.isInteger(duracao) || duracao < 15 || duracao > 480 || duracao % 5 !== 0) {
    return { erro: "A duração precisa ser de 15 a 480 minutos, em múltiplos de 5." };
  }
  if (!Number.isFinite(preco) || preco <= 0 || preco > 10000) return { erro: "O preço precisa ser maior que zero e até R$ 10.000." };
  if (Math.abs(preco * 100 - Math.round(preco * 100)) > 1e-6) {
    return { erro: "O preço pode ter no máximo 2 casas decimais." };
  }
  return { dados: { nome, duracao_minutos: duracao, preco: Math.round(preco * 100) / 100 } };
}

// Já existe outro serviço ATIVO com esse nome?
async function nomeEmUso(nome, ignorarId) {
  const { data, error } = await supabase.from("servicos").select("id, nome").eq("ativo", true);
  if (error) throw error;
  const alvo = nome.toLowerCase();
  return data.some((s) => s.id !== ignorarId && String(s.nome).trim().toLowerCase() === alvo);
}

const falhaInterna = (res, err) => {
  console.error("Erro em serviços:", err.message);
  return erroServico(res, 500, "Erro interno no servidor.");
};

// GET /api/admin/servicos: todos, inclusive os desativados
router.get("/servicos", async (req, res) => {
  const { data, error } = await supabase
    .from("servicos")
    .select("*")
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });
  if (error) return falhaInterna(res, error);
  res.json(data);
});

// POST /api/admin/servicos   { nome, duracao_minutos, preco }
router.post("/servicos", async (req, res) => {
  const { dados, erro } = validarServico(req.body);
  if (erro) return erroServico(res, 400, erro);
  try {
    if (await nomeEmUso(dados.nome)) return erroServico(res, 409, "Já existe um serviço ativo com esse nome.");
    const { data, error } = await supabase.from("servicos").insert({ ...dados, ativo: true }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    falhaInterna(res, err);
  }
});

// PUT /api/admin/servicos/:id   { nome, duracao_minutos, preco }
// Cria a nova versão e desativa a antiga (os agendamentos antigos ficam na versão antiga).
router.put("/servicos/:id", async (req, res) => {
  const { dados, erro } = validarServico(req.body);
  if (erro) return erroServico(res, 400, erro);
  try {
    const { data: antigo, error: e1 } = await supabase.from("servicos").select("*").eq("id", req.params.id).maybeSingle();
    if (e1) throw e1;
    if (!antigo) return erroServico(res, 404, "Serviço não encontrado.");
    if (!antigo.ativo) return erroServico(res, 409, "Este serviço está desativado. Reative antes de editar.");

    const igual = antigo.nome === dados.nome
      && Number(antigo.duracao_minutos) === dados.duracao_minutos
      && Number(antigo.preco) === dados.preco;
    if (igual) return erroServico(res, 422, "Nenhuma alteração foi feita.");
    if (await nomeEmUso(dados.nome, antigo.id)) return erroServico(res, 409, "Já existe um serviço ativo com esse nome.");

    const { data: novo, error: e2 } = await supabase.from("servicos").insert({ ...dados, ativo: true }).select().single();
    if (e2) throw e2;

    const { error: e3 } = await supabase.from("servicos").update({ ativo: false }).eq("id", antigo.id);
    if (e3) {
      // não deixa duas versões ativas: desfaz a nova (ela ainda não tem agendamentos)
      await supabase.from("servicos").delete().eq("id", novo.id);
      throw e3;
    }
    res.json(novo);
  } catch (err) {
    falhaInterna(res, err);
  }
});

// PATCH /api/admin/servicos/:id/ativo   { ativo: true | false }
router.patch("/servicos/:id/ativo", async (req, res) => {
  if (typeof req.body?.ativo !== "boolean") return erroServico(res, 400, "Informe ativo como verdadeiro ou falso.");
  try {
    const { data: atual, error: e1 } = await supabase.from("servicos").select("*").eq("id", req.params.id).maybeSingle();
    if (e1) throw e1;
    if (!atual) return erroServico(res, 404, "Serviço não encontrado.");
    if (req.body.ativo && !atual.ativo && (await nomeEmUso(atual.nome, atual.id))) {
      return erroServico(res, 409, "Já existe um serviço ativo com esse nome. Desative o outro antes.");
    }
    const { data, error } = await supabase.from("servicos").update({ ativo: req.body.ativo }).eq("id", atual.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    falhaInterna(res, err);
  }
});

// GET /api/admin/dashboard?inicio=2026-11-01&fim=2026-11-30
router.get("/dashboard", async (req, res) => {
  const [ano, mes] = hojeBrasil().split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const inicioPadrao = `${ano}-${pad(mes)}-01`;
  const fimPadrao = `${ano}-${pad(mes)}-${pad(new Date(ano, mes, 0).getDate())}`;

  const inicio = req.query.inicio || inicioPadrao;
  const fim = req.query.fim || fimPadrao;

  const { data: agendamentos, error } = await supabase
    .from("agendamentos")
    .select("status, servico_id, servicos(nome, preco)")
    .gte("data", inicio)
    .lte("data", fim);

  if (error) { console.error(error.message); return res.status(500).json({ erro: "Erro interno no servidor." }); }

  const concluidos = agendamentos.filter((a) => a.status === "concluido");
  const faturamento = concluidos.reduce((soma, a) => soma + Number(a.servicos.preco), 0);
  const ticketMedio = concluidos.length ? faturamento / concluidos.length : 0;

  // A receber: agendados (confirmados ou pendentes) que ainda não foram concluídos
  const aReceber = agendamentos.filter((a) => a.status === "confirmado" || a.status === "pendente");
  const faturamentoPendente = aReceber.reduce((soma, a) => soma + Number(a.servicos.preco), 0);

  // Cancelado: valor que deixou de entrar com os agendamentos cancelados
  const cancelados = agendamentos.filter((a) => a.status === "cancelado");
  const faturamentoCancelado = cancelados.reduce((soma, a) => soma + Number(a.servicos.preco), 0);

  const rankingMap = new Map();
  agendamentos
    .filter((a) => a.status !== "cancelado")
    .forEach((a) => {
      const nome = a.servicos.nome;
      rankingMap.set(nome, (rankingMap.get(nome) || 0) + 1);
    });

  const ranking = [...rankingMap.entries()]
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  res.json({
    periodo: { inicio, fim },
    faturamento,
    servicosPrestados: concluidos.length,
    ticketMedio,
    faturamentoPendente,
    atendimentosPendentes: aReceber.length,
    faturamentoCancelado,
    atendimentosCancelados: cancelados.length,
    servicosMaisContratados: ranking,
    statusDaAgenda: {
      concluido: concluidos.length,
      confirmado: agendamentos.filter((a) => a.status === "confirmado").length,
      pendente: agendamentos.filter((a) => a.status === "pendente").length,
      cancelado: agendamentos.filter((a) => a.status === "cancelado").length,
    },
  });
});

module.exports = router;
