const express = require("express");
const { rateLimit } = require("express-rate-limit");
const svc = require("../services/agendamento.service");
const R = require("../regras");

const router = express.Router();

// IP real do cliente. No Render o servidor fica atrás de proxies: o Cloudflare informa
// o IP verdadeiro em "true-client-ip". Sem isso, todo mundo pareceria ter o mesmo IP.
const chaveCliente = (req) =>
  String(req.headers["true-client-ip"] || req.headers["cf-connecting-ip"] || req.ip || "desconhecido");

const MENSAGEM_TENTATIVAS = {
  erro: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  codigo: "MUITAS_TENTATIVAS",
};

// Limite de tentativas por IP: só as que FALHAM contam (telefone/código errados, por exemplo)
const limitarTentativas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: chaveCliente,
  standardHeaders: true,
  legacyHeaders: false,
  message: MENSAGEM_TENTATIVAS,
});

// Limite de tentativas por TELEFONE: protege o agendamento de uma pessoa específica
// mesmo que quem tenta adivinhar o código troque de IP.
const limitarPorTelefone = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `tel:${String(req.query.telefone ?? req.body?.telefone ?? "").replace(/\D/g, "")}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: MENSAGEM_TENTATIVAS,
});
const protegerTentativas = [limitarTentativas, limitarPorTelefone];

// Limite de agendamentos novos por IP, contra agendamentos falsos em massa
const limitarCriacao = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: chaveCliente,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitos agendamentos em pouco tempo. Tente novamente mais tarde.", codigo: "MUITAS_TENTATIVAS" },
});

// Erros de regra viram respostas claras; qualquer outro erro não vaza detalhes do banco
function responderErro(res, err) {
  if (err.status) return res.status(err.status).json({ erro: err.message, codigo: err.codigo });
  console.error(err);
  return res.status(500).json({ erro: "Erro interno no servidor." });
}

// GET /api/agendamentos/meu-ip  (diagnóstico: mostra o IP que o limite de tentativas enxerga)
router.get("/meu-ip", (req, res) => res.json({ ip: chaveCliente(req) }));

// GET /api/agendamentos/horarios?data=2026-11-24&servico_id=...&ignorar=...
router.get("/horarios", async (req, res) => {
  const { data, servico_id, ignorar } = req.query;
  if (!data) return res.status(400).json({ erro: "Informe a data (YYYY-MM-DD).", codigo: "DATA_INVALIDA" });

  try {
    res.json(await svc.listarHorariosDisponiveis(data, servico_id, ignorar));
  } catch (err) {
    responderErro(res, err);
  }
});

// POST /api/agendamentos
router.post("/", limitarCriacao, async (req, res) => {
  const { nome, telefone, servico_id, data, hora } = req.body;
  if (!nome || !telefone || !servico_id || !data || !hora) {
    return res.status(400).json({ erro: "Preencha nome, telefone, serviço, data e horário.", codigo: "DADOS_INVALIDOS" });
  }

  try {
    res.status(201).json(await svc.criarAgendamento({ nome, telefone, servico_id, data, hora }));
  } catch (err) {
    responderErro(res, err);
  }
});

// GET /api/agendamentos/consulta?telefone=...&codigo=...
router.get("/consulta", protegerTentativas, async (req, res) => {
  const { telefone, codigo } = req.query;
  if (!telefone || !codigo) {
    return res.status(400).json({ erro: "Informe telefone e código de confirmação.", codigo: "DADOS_INVALIDOS" });
  }

  try {
    const agendamento = await svc.buscarPorTelefoneECodigo({ telefone, codigo });
    if (!agendamento) {
      return res.status(404).json({ erro: "Nenhum agendamento encontrado com esses dados.", codigo: "NAO_ENCONTRADO" });
    }

    // Informa ao front-end se ainda dá para cancelar/trocar o horário
    const ativo = ["confirmado", "pendente"].includes(agendamento.status);
    const prazo = R.verificarPrazoAlteracao(agendamento);
    res.json({
      ...agendamento,
      podeAlterar: ativo && prazo.pode,
      avisoAlteracao: ativo && !prazo.pode ? prazo.mensagem : null,
    });
  } catch (err) {
    responderErro(res, err);
  }
});

// Valida telefone + código e o prazo antes de cancelar ou trocar o horário
async function validarPosseEPrazo(req, res, next) {
  const { telefone, codigo } = req.body;
  if (!telefone || !codigo) {
    return res.status(400).json({ erro: "Informe telefone e código de confirmação.", codigo: "DADOS_INVALIDOS" });
  }

  try {
    const agendamento = await svc.buscarPorTelefoneECodigo({ telefone, codigo });
    if (!agendamento || agendamento.id !== req.params.id) {
      return res.status(403).json({ erro: "Telefone ou código não conferem com este agendamento.", codigo: "NAO_CONFERE" });
    }
    if (["cancelado", "concluido"].includes(agendamento.status)) {
      return res.status(409).json({ erro: "Este agendamento não pode mais ser alterado.", codigo: "JA_ENCERRADO" });
    }

    const prazo = R.verificarPrazoAlteracao(agendamento);
    if (!prazo.pode) {
      return res.status(422).json({ erro: prazo.mensagem, codigo: "PRAZO_ALTERACAO" });
    }

    req.agendamento = agendamento;
    next();
  } catch (err) {
    responderErro(res, err);
  }
}

// PATCH /api/agendamentos/:id/cancelar   { telefone, codigo }
router.patch("/:id/cancelar", protegerTentativas, validarPosseEPrazo, async (req, res) => {
  try {
    res.json(await svc.atualizarStatus(req.params.id, "cancelado"));
  } catch (err) {
    responderErro(res, err);
  }
});

// PATCH /api/agendamentos/:id/reagendar   { telefone, codigo, data, hora }
router.patch("/:id/reagendar", protegerTentativas, validarPosseEPrazo, async (req, res) => {
  const { data, hora } = req.body;
  if (!data || !hora) {
    return res.status(400).json({ erro: "Informe a nova data e horário.", codigo: "DADOS_INVALIDOS" });
  }

  try {
    res.json(await svc.reagendarHorario(req.agendamento, { data, hora }));
  } catch (err) {
    responderErro(res, err);
  }
});

module.exports = router;
