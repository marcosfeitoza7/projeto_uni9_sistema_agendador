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
