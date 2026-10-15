const express = require("express");
const supabase = require("../supabaseClient");
const svc = require("../services/agendamento.service");
const { exigirLogin } = require("../middleware/auth");

const router = express.Router();

// Todas as rotas abaixo exigem um token válido da lash designer
router.use(exigirLogin);

// GET /api/admin/agenda?data=2026-11-10
router.get("/agenda", async (req, res) => {
  const data = req.query.data || new Date().toISOString().slice(0, 10);

  const { data: agendamentos, error } = await supabase
    .from("agendamentos")
    .select("*, servicos(nome, preco, duracao_minutos), clientes(nome, telefone)")
    .eq("data", data)
    .order("hora", { ascending: true });

  if (error) return res.status(500).json({ erro: error.message });
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
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/admin/dashboard?inicio=2026-11-01&fim=2026-11-30
router.get("/dashboard", async (req, res) => {
  const hoje = new Date();
  const inicioPadrao = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const fimPadrao = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  const inicio = req.query.inicio || inicioPadrao;
  const fim = req.query.fim || fimPadrao;

  const { data: agendamentos, error } = await supabase
    .from("agendamentos")
    .select("status, servico_id, servicos(nome, preco)")
    .gte("data", inicio)
    .lte("data", fim);

  if (error) return res.status(500).json({ erro: error.message });

  const concluidos = agendamentos.filter((a) => a.status === "concluido");
  const faturamento = concluidos.reduce((soma, a) => soma + Number(a.servicos.preco), 0);
  const ticketMedio = concluidos.length ? faturamento / concluidos.length : 0;

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
