const express = require("express");
const supabase = require("../supabaseClient");
const R = require("../regras");

// Horários de funcionamento e lista de agendamentos, para a profissional.
// Este router é usado dentro de admin.js, depois do login (exigirLogin).
//
// Regras:
//  - Data específica (excecao_data): só pode ser criada/alterada/removida se todos os agendamentos
//    ativos do dia continuarem dentro do novo horário.
//  - Dia da semana (horario_semanal): sempre pode ser salvo, mas a resposta traz a lista de
//    agendamentos futuros que ficaram fora do novo horário, para a profissional avisar as clientes.
//  - Nada é cancelado ou remarcado automaticamente: o sistema só avisa. Se quiser, a profissional
//    cancela o agendamento e avisa a cliente.

const router = express.Router();

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const paraExpediente = (linha) =>
  linha && linha.aberto ? { abre: hhmm(linha.abre), fecha: hhmm(linha.fecha) } : null;
const erro = (res, status, mensagem, extra = {}) => res.status(status).json({ erro: mensagem, ...extra });
const falhaInterna = (res, err) => {
  console.error("Erro em horários:", err.message);
  return erro(res, 500, "Erro interno no servidor.");
};

// O agendamento (já feito) cabe no expediente? Cabe se começa depois de abrir e termina até fechar.
function foraDoExpediente(agendamento, expediente) {
  if (!expediente) return true;
  const inicio = R.paraMin(agendamento.hora);
  const fim = inicio + (agendamento.duracaoMin ?? R.REGRAS.duracaoPadraoMin);
  return inicio < R.paraMin(expediente.abre) || fim > R.paraMin(expediente.fecha);
}

// Confere { aberto, abre, fecha } vindo do formulário. Devolve { dados } ou { mensagem }.
function validarExpediente(corpo) {
  if (typeof corpo?.aberto !== "boolean") return { mensagem: "Informe se o studio abre neste dia." };
  if (!corpo.aberto) return { dados: { aberto: false, abre: null, fecha: null } };

  const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t));
  if (!ok(corpo.abre) || !ok(corpo.fecha)) return { mensagem: "Informe os horários de abrir e fechar (HH:MM)." };
  if (R.paraMin(corpo.abre) >= R.paraMin(corpo.fecha)) return { mensagem: "O horário de abrir precisa ser antes do de fechar." };
  return { dados: { aberto: true, abre: corpo.abre, fecha: corpo.fecha } };
}

const formatarAgendamento = (a) => ({
  id: a.id,
  data: a.data,
  hora: hhmm(a.hora),
  status: a.status,
  servico: a.servicos?.nome,
  duracao_minutos: a.servicos?.duracao_minutos,
  cliente: a.clientes?.nome,
  telefone: a.clientes?.telefone,
});

async function carregarConfiguracao(hoje) {
  const [semana, excecoes] = await Promise.all([
    supabase.from("horario_semanal").select("*").order("dia_semana"),
    supabase.from("excecao_data").select("*").gte("data", hoje).order("data"),
  ]);
  if (semana.error) throw semana.error;
  if (excecoes.error) throw excecoes.error;
  return { semana: semana.data, excecoes: excecoes.data };
}

// Agendamentos ativos, de agora em diante, que estão fora do funcionamento atual
async function conflitosFuturos() {
  const agora = R.agoraBrasil();
  const { semana, excecoes } = await carregarConfiguracao(agora.data);

  const { data, error } = await supabase
    .from("agendamentos")
    .select("id, data, hora, status, servicos(nome, duracao_minutos), clientes(nome, telefone)")
    .gte("data", agora.data)
    .in("status", ["confirmado", "pendente"])
    .order("data")
    .order("hora");
  if (error) throw error;

  const porData = new Map(excecoes.map((e) => [e.data, e]));
  const porDia = new Map(semana.map((s) => [s.dia_semana, s]));
  const agoraAbs = R.absoluto(agora.data, agora.minutos);

  return data
    .filter((a) => R.absolutoDe(a.data, a.hora) >= agoraAbs)
    .filter((a) => {
      const linha = porData.get(a.data) || porDia.get(R.diaDaSemana(a.data));
      return foraDoExpediente({ hora: a.hora, duracaoMin: a.servicos?.duracao_minutos }, paraExpediente(linha));
    })
    .map(formatarAgendamento);
}

// GET /api/admin/horarios: grade semanal, datas especiais futuras e agendamentos fora do horário
router.get("/horarios", async (req, res) => {
  try {
    const config = await carregarConfiguracao(R.agoraBrasil().data);
    res.json({
      semana: config.semana.map((s) => ({ dia_semana: s.dia_semana, aberto: s.aberto, abre: hhmm(s.abre), fecha: hhmm(s.fecha) })),
      excecoes: config.excecoes.map((e) => ({ data: e.data, aberto: e.aberto, abre: hhmm(e.abre), fecha: hhmm(e.fecha), motivo: e.motivo })),
      conflitos: await conflitosFuturos(),
    });
  } catch (err) {
    falhaInterna(res, err);
  }
});

// PUT /api/admin/horarios/semana/:dia   { aberto, abre, fecha }   (dia: 0 = domingo ... 6 = sábado)
router.put("/horarios/semana/:dia", async (req, res) => {
  const dia = Number(req.params.dia);
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) return erro(res, 400, "Dia da semana inválido.");
  const { dados, mensagem } = validarExpediente(req.body);
  if (mensagem) return erro(res, 400, mensagem);

  try {
    const { error } = await supabase.from("horario_semanal").upsert({ dia_semana: dia, ...dados });
    if (error) throw error;
    res.json({ ok: true, conflitos: await conflitosFuturos() });
  } catch (err) {
    falhaInterna(res, err);
  }
});

// Agendamentos ativos de uma data
async function ativosDaData(data) {
  const { data: lista, error } = await supabase
    .from("agendamentos")
    .select("id, data, hora, status, servicos(nome, duracao_minutos), clientes(nome, telefone)")
    .eq("data", data)
    .in("status", ["confirmado", "pendente"])
    .order("hora");
  if (error) throw error;
  return lista.map(formatarAgendamento);
}

// Confere a data da URL (válida e a partir de hoje)
function validarDataFutura(data) {
  if (!R.dataValida(data)) return "Data inválida.";
  if (data < R.agoraBrasil().data) return "Só é possível alterar datas a partir de hoje.";
  return null;
}

// PUT /api/admin/horarios/data/:data   { aberto, abre, fecha, motivo }
router.put("/horarios/data/:data", async (req, res) => {
  const { data } = req.params;
  const problema = validarDataFutura(data);
  if (problema) return erro(res, 400, problema);
  const { dados, mensagem } = validarExpediente(req.body);
  if (mensagem) return erro(res, 400, mensagem);
  const motivo = String(req.body?.motivo ?? "").trim().slice(0, 80) || null;

  try {
    const expediente = dados.aberto ? { abre: dados.abre, fecha: dados.fecha } : null;
    const fora = (await ativosDaData(data)).filter((a) => foraDoExpediente({ hora: a.hora, duracaoMin: a.duracao_minutos }, expediente));
    if (fora.length) {
      return erro(res, 409, "Este dia tem agendamentos que ficariam fora do novo horário. Cancele-os antes (e avise as clientes) ou escolha um horário que comporte todos.", { agendamentos: fora });
    }
    const { error } = await supabase.from("excecao_data").upsert({ data, ...dados, motivo });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    falhaInterna(res, err);
  }
});

// DELETE /api/admin/horarios/data/:data: volta a valer o horário do dia da semana
router.delete("/horarios/data/:data", async (req, res) => {
  const { data } = req.params;
  if (!R.dataValida(data)) return erro(res, 400, "Data inválida.");

  try {
    const { data: semana, error: erroSemana } = await supabase
      .from("horario_semanal").select("*").eq("dia_semana", R.diaDaSemana(data)).maybeSingle();
    if (erroSemana) throw erroSemana;

    const expediente = paraExpediente(semana);
    const fora = (await ativosDaData(data)).filter((a) => foraDoExpediente({ hora: a.hora, duracaoMin: a.duracao_minutos }, expediente));
    if (fora.length) {
      return erro(res, 409, "Há agendamentos neste dia que não caberiam no horário normal. Não é possível remover a data especial.", { agendamentos: fora });
    }

    const { error } = await supabase.from("excecao_data").delete().eq("data", data);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    falhaInterna(res, err);
  }
});

// GET /api/admin/agendamentos?de=&ate=&status=: todos os agendamentos (mais recentes primeiro)
router.get("/agendamentos", async (req, res) => {
  const { de, ate, status } = req.query;
  const validos = ["pendente", "confirmado", "concluido", "cancelado"];
  if ((de && !R.dataValida(de)) || (ate && !R.dataValida(ate))) return erro(res, 400, "Data inválida.");
  if (status && !validos.includes(status)) return erro(res, 400, "Status inválido.");

  try {
    let consulta = supabase
      .from("agendamentos")
      .select("id, data, hora, status, servicos(nome, duracao_minutos), clientes(nome, telefone)")
      .order("data", { ascending: false })
      .order("hora", { ascending: false })
      .limit(500);
    if (de) consulta = consulta.gte("data", de);
    if (ate) consulta = consulta.lte("data", ate);
    if (status) consulta = consulta.eq("status", status);

    const { data, error } = await consulta;
    if (error) throw error;
    res.json(data.map(formatarAgendamento));
  } catch (err) {
    falhaInterna(res, err);
  }
});

module.exports = router;
module.exports.foraDoExpediente = foraDoExpediente;
module.exports.validarExpediente = validarExpediente;
