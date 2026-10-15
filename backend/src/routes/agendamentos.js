const express = require("express");
const svc = require("../services/agendamento.service");

const router = express.Router();

// GET /api/agendamentos/horarios?data=2026-11-10
// Lista os horários do dia e quais já estão ocupados
router.get("/horarios", async (req, res) => {
  const { data } = req.query;
  if (!data) return res.status(400).json({ erro: "Informe a data (YYYY-MM-DD)." });

  try {
    const horarios = await svc.listarHorariosDisponiveis(data);
    res.json(horarios);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/agendamentos
// Cria o agendamento (já confirmado) e devolve o código de confirmação
router.post("/", async (req, res) => {
  const { nome, telefone, servico_id, data, hora } = req.body;

  if (!nome || !telefone || !servico_id || !data || !hora) {
    return res.status(400).json({ erro: "Preencha nome, telefone, serviço, data e horário." });
  }

  try {
    const agendamento = await svc.criarAgendamento({ nome, telefone, servico_id, data, hora });
    res.status(201).json(agendamento);
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message });
  }
});

// GET /api/agendamentos/consulta?telefone=...&codigo=...
// Telefone + código funcionam como a "senha" do agendamento
router.get("/consulta", async (req, res) => {
  const { telefone, codigo } = req.query;
  if (!telefone || !codigo) {
    return res.status(400).json({ erro: "Informe telefone e código de confirmação." });
  }

  try {
    const agendamento = await svc.buscarPorTelefoneECodigo({ telefone, codigo });
    if (!agendamento) {
      return res.status(404).json({ erro: "Nenhum agendamento encontrado com esses dados." });
    }
    res.json(agendamento);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Valida telefone + código antes de cancelar ou reagendar, para que
// ninguém altere o agendamento de outra pessoa.
async function validarPosseDoAgendamento(req, res, next) {
  const { telefone, codigo } = req.body;
  if (!telefone || !codigo) {
    return res.status(400).json({ erro: "Informe telefone e código de confirmação." });
  }

  try {
    const agendamento = await svc.buscarPorTelefoneECodigo({ telefone, codigo });
    if (!agendamento || agendamento.id !== req.params.id) {
      return res.status(403).json({ erro: "Telefone ou código não conferem com este agendamento." });
    }

    // Agendamentos já cancelados ou concluídos não podem mais ser alterados
    if (["cancelado", "concluido"].includes(agendamento.status)) {
      return res.status(409).json({ erro: "Este agendamento não pode mais ser alterado." });
    }

    req.agendamento = agendamento;
    next();
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
}

// PATCH /api/agendamentos/:id/cancelar   { telefone, codigo }
router.patch("/:id/cancelar", validarPosseDoAgendamento, async (req, res) => {
  try {
    const atualizado = await svc.atualizarStatus(req.params.id, "cancelado");
    res.json(atualizado);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PATCH /api/agendamentos/:id/reagendar   { telefone, codigo, data, hora }
router.patch("/:id/reagendar", validarPosseDoAgendamento, async (req, res) => {
  const { data, hora } = req.body;
  if (!data || !hora) return res.status(400).json({ erro: "Informe a nova data e horário." });

  try {
    const atualizado = await svc.reagendarHorario(req.params.id, { data, hora });
    res.json(atualizado);
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message });
  }
});

module.exports = router;
