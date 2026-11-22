// =========================================================
// Regras de negócio do agendamento.
// Para mudar uma regra, edite só o bloco REGRAS logo abaixo.
// =========================================================

const REGRAS = {
  fusoHorario: "America/Sao_Paulo",

  antecedenciaMinimaMin: 2 * 60,   // só dá para agendar com pelo menos 2 horas de antecedência
  prazoAlteracaoMin: 4 * 60,      // o cliente só cancela ou troca o horário até 4 horas antes
  limiteAtivosPorTelefone: 2,      // agendamentos ativos ao mesmo tempo para o mesmo telefone
  duracaoPadraoMin: 60,            // usada quando a duração do serviço não é informada

  // Os horários de funcionamento (por dia da semana e por data) ficam no banco
  // e são editados pela profissional na tela "Horários".
  // Os horários de início são gerados a partir da abertura, de hora em hora.
  passoHorarioMin: 60,
};

// Erro de regra de negócio: vira uma resposta clara para o cliente.
// status 422 = regra violada; 409 = horário ocupado; 400 = dados inválidos.
class ErroRegra extends Error {
  constructor(mensagem, status = 422, codigo = "REGRA") {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

// ---------- Relógio (sempre no horário do Brasil, mesmo com o servidor em UTC) ----------
let relogio = () => new Date();
const definirRelogio = (fn) => { relogio = fn; };   // usado só nos testes

function agoraBrasil() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: REGRAS.fusoHorario,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    })
      .formatToParts(relogio())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

// ---------- Datas e horas ----------
const paraMin = (hhmm) => {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

function dataValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Minutos desde uma origem fixa: serve para comparar data+hora de forma simples
const absoluto = (data, minutos) => {
  const [a, m, d] = data.split("-").map(Number);
  return Date.UTC(a, m - 1, d) / 60000 + minutos;
};
const absolutoDe = (data, hhmm) => absoluto(data, paraMin(hhmm));

const diaDaSemana = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

// Última data em que dá para agendar: o mesmo dia do mês seguinte, menos 1 dia.
// Exemplo: hoje 21/11 libera até 20/12.
function limiteAgendamento(hoje) {
  const [a, m, d] = hoje.split("-").map(Number);
  const ultimoDiaDoMesSeguinte = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDiaDoMesSeguinte);
  return new Date(Date.UTC(a, m, dia - 1)).toISOString().slice(0, 10);
}

const formatarData = (iso) => iso.split("-").reverse().slice(0, 2).join("/");
const horasTexto = (min) => {
  const h = min / 60;
  return `${h} ${h === 1 ? "hora" : "horas"}`;
};

// ---------- Avaliação de um horário ----------
const recusa = (codigo, mensagem, status = 422) => ({ ok: false, codigo, mensagem, status });

// Diz se um horário pode ser agendado e, se não puder, por quê.
// agendamentosDoDia: [{ id, hora: "09:00", duracaoMin }] (apenas os não cancelados)
// expediente: { abre: "09:00", fecha: "18:00" } do dia, ou null se o studio não atende.
function avaliarHorario({ data, hora, duracaoMin, agora, expediente, agendamentosDoDia = [], ignorarId = null }) {
  const limite = limiteAgendamento(agora.data);
  if (data > limite) {
    return recusa("FORA_DA_JANELA", `Só é possível agendar até ${formatarData(limite)}.`);
  }

  if (!expediente) return recusa("FECHADO", "O studio não atende neste dia.");

  const inicio = paraMin(hora);
  const fim = inicio + duracaoMin;
  if (inicio < paraMin(expediente.abre) || fim > paraMin(expediente.fecha)) {
    return recusa("FORA_EXPEDIENTE", "Este horário fica fora do expediente para este serviço.");
  }

  if (absoluto(data, inicio) < absoluto(agora.data, agora.minutos) + REGRAS.antecedenciaMinimaMin) {
    return recusa(
      "ANTECEDENCIA",
      `É preciso agendar com pelo menos ${horasTexto(REGRAS.antecedenciaMinimaMin)} de antecedência.`
    );
  }

  const ocupado = agendamentosDoDia.some(
    (a) => a.id !== ignorarId && inicio < paraMin(a.hora) + a.duracaoMin && paraMin(a.hora) < fim
  );
  if (ocupado) return recusa("HORARIO_OCUPADO", "Esse horário não está mais disponível.", 409);

  return { ok: true };
}

// Horários em que um atendimento pode começar: da abertura até antes do fechamento,
// de hora em hora. Quem decide se o serviço cabe é o avaliarHorario (duração + fechamento).
function gerarHorariosInicio(expediente) {
  if (!expediente) return [];
  const horarios = [];
  for (let m = paraMin(expediente.abre); m < paraMin(expediente.fecha); m += REGRAS.passoHorarioMin) {
    horarios.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return horarios;
}

// O cliente só pode cancelar ou trocar o horário com antecedência mínima
function verificarPrazoAlteracao(agendamento, agora = agoraBrasil()) {
  const falta = absolutoDe(agendamento.data, agendamento.hora) - absoluto(agora.data, agora.minutos);
  if (falta >= REGRAS.prazoAlteracaoMin) return { pode: true };
  return {
    pode: false,
    mensagem:
      `Cancelamentos e trocas de horário só podem ser feitos com pelo menos ` +
      `${horasTexto(REGRAS.prazoAlteracaoMin)} de antecedência. Entre em contato com o studio.`,
  };
}

module.exports = {
  REGRAS, ErroRegra, definirRelogio, agoraBrasil,
  paraMin, dataValida, absoluto, absolutoDe, diaDaSemana,
  limiteAgendamento, avaliarHorario, gerarHorariosInicio, verificarPrazoAlteracao,
};
