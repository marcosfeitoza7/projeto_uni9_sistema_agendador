const supabase = require("../supabaseClient");
const R = require("../regras");

const { ErroRegra, REGRAS } = R;
const HORARIOS_PADRAO = REGRAS.horariosInicio;

const crypto = require("crypto");
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I, fáceis de confundir
const gerarCodigoConfirmacao = () =>
  Array.from({ length: 4 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");
const normalizarTelefone = (telefone) => String(telefone || "").replace(/\D/g, "");

// ---------- Consultas auxiliares ----------
// permitirInativo: quem já tem agendamento numa versão antiga do serviço (hoje desativada)
// continua podendo trocar o horário; só novos agendamentos exigem serviço ativo.
async function buscarServico(id, { permitirInativo = false } = {}) {
  const { data, error } = await supabase
    .from("servicos")
    .select("id, nome, preco, duracao_minutos, ativo")
    .eq("id", id)
    .maybeSingle();

  if (error && error.code !== "22P02") throw error;   // 22P02 = id em formato inválido
  if (error || !data || (!data.ativo && !permitirInativo)) {
    throw new ErroRegra("Esse serviço não está disponível.", 422, "SERVICO_INVALIDO");
  }
  return data;
}

// Agendamentos ativos do dia, já com a duração de cada serviço
async function agendamentosDoDia(data) {
  const { data: lista, error } = await supabase
    .from("agendamentos")
    .select("id, hora, status, servicos(duracao_minutos)")
    .eq("data", data)
    .neq("status", "cancelado");

  if (error) throw error;
  return lista.map((a) => ({
    id: a.id,
    hora: String(a.hora).slice(0, 5),
    duracaoMin: a.servicos?.duracao_minutos ?? REGRAS.duracaoPadraoMin,
  }));
}

async function buscarCliente(telefoneLimpo) {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("telefone", telefoneLimpo)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Busca o cliente pelo telefone; cria um novo registro se não existir.
async function buscarOuCriarCliente({ nome, telefone }) {
  const telefoneLimpo = normalizarTelefone(telefone);
  const existente = await buscarCliente(telefoneLimpo);
  if (existente) return existente;

  const { data: novo, error } = await supabase
    .from("clientes")
    .insert({ nome, telefone: telefoneLimpo })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return buscarCliente(telefoneLimpo);   // criado no mesmo instante por outra requisição
    throw error;
  }
  return novo;
}

// Regra: limite de agendamentos ativos (e ainda por acontecer) por telefone
async function verificarLimiteAtivos(clienteId, agora) {
  const { data, error } = await supabase
    .from("agendamentos")
    .select("data, hora")
    .eq("cliente_id", clienteId)
    .in("status", ["confirmado", "pendente"])
    .gte("data", agora.data);

  if (error) throw error;
  const agoraAbs = R.absoluto(agora.data, agora.minutos);
  const ativos = data.filter((a) => R.absolutoDe(a.data, a.hora) >= agoraAbs).length;

  if (ativos >= REGRAS.limiteAtivosPorTelefone) {
    throw new ErroRegra(
      `Este telefone já tem ${ativos} agendamentos ativos, que é o máximo permitido. ` +
      `Cancele um deles ou aguarde o atendimento para agendar outro.`,
      422,
      "LIMITE_AGENDAMENTOS"
    );
  }
}

// ---------- Horários ----------
// Lista os horários do dia já aplicando TODAS as regras (funcionamento, janela,
// antecedência e duração do serviço). Se informar "ignorarId", o próprio
// agendamento não conta como ocupado (usado na troca de horário).
async function listarHorariosDisponiveis(data, servicoId, ignorarId) {
  if (!R.dataValida(data)) throw new ErroRegra("Data inválida.", 400, "DATA_INVALIDA");

  const duracaoMin = servicoId ? (await buscarServico(servicoId, { permitirInativo: Boolean(ignorarId) })).duracao_minutos : REGRAS.duracaoPadraoMin;
  const doDia = await agendamentosDoDia(data);
  const agora = R.agoraBrasil();

  return HORARIOS_PADRAO.map((hora) => {
    const r = R.avaliarHorario({ data, hora, duracaoMin, agora, agendamentosDoDia: doDia, ignorarId });
    return { hora, disponivel: r.ok, motivo: r.ok ? null : r.codigo };
  });
}

// ---------- Criar ----------
async function criarAgendamento({ nome, telefone, servico_id, data, hora }) {
  const nomeLimpo = String(nome || "").trim();
  const telefoneLimpo = normalizarTelefone(telefone);

  if (nomeLimpo.length < 2 || nomeLimpo.length > 80) {
    throw new ErroRegra("Informe o nome completo.", 400, "DADOS_INVALIDOS");
  }
  if (![10, 11].includes(telefoneLimpo.length)) {
    throw new ErroRegra("Informe o telefone com DDD.", 400, "DADOS_INVALIDOS");
  }
  if (!R.dataValida(data) || !HORARIOS_PADRAO.includes(String(hora).slice(0, 5))) {
    throw new ErroRegra("Data ou horário inválido.", 400, "DADOS_INVALIDOS");
  }
  const horaPadrao = String(hora).slice(0, 5);

  const servico = await buscarServico(servico_id);
  const agora = R.agoraBrasil();
  const doDia = await agendamentosDoDia(data);

  const avaliacao = R.avaliarHorario({
    data, hora: horaPadrao, duracaoMin: servico.duracao_minutos, agora, agendamentosDoDia: doDia,
  });
  if (!avaliacao.ok) throw new ErroRegra(avaliacao.mensagem, avaliacao.status, avaliacao.codigo);

  const existente = await buscarCliente(telefoneLimpo);
  if (existente) await verificarLimiteAtivos(existente.id, agora);
  const cliente = existente || (await buscarOuCriarCliente({ nome: nomeLimpo, telefone: telefoneLimpo }));

  const { data: agendamento, error } = await supabase
    .from("agendamentos")
    .insert({
      cliente_id: cliente.id,
      servico_id,
      data,
      hora: horaPadrao,
      codigo_confirmacao: gerarCodigoConfirmacao(),
      status: "confirmado",
    })
    .select("*, servicos(nome, preco, duracao_minutos)")
    .single();

  // O índice único do banco barra dois agendamentos no mesmo horário de início,
  // mesmo que duas pessoas tentem no mesmo instante.
  if (error) {
    if (error.code === "23505") {
      throw new ErroRegra("Esse horário acabou de ser reservado por outra pessoa.", 409, "HORARIO_OCUPADO");
    }
    throw error;
  }
  return agendamento;
}

// ---------- Consultar / alterar ----------
async function buscarPorTelefoneECodigo({ telefone, codigo }) {
  const cliente = await buscarCliente(normalizarTelefone(telefone));
  if (!cliente) return null;

  const { data: agendamento, error } = await supabase
    .from("agendamentos")
    .select("*, servicos(nome, preco, duracao_minutos), clientes(nome, telefone)")
    .eq("cliente_id", cliente.id)
    .eq("codigo_confirmacao", String(codigo).toUpperCase())
    .order("criado_em", { ascending: false })
    .maybeSingle();

  if (error) throw error;
  return agendamento;
}

async function atualizarStatus(id, status) {
  const { data, error } = await supabase
    .from("agendamentos")
    .update({ status })
    .eq("id", id)
    .select("*, servicos(nome, preco)")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ErroRegra(
        "Esse horário já foi ocupado por outro agendamento, então não é possível reabrir este.",
        409,
        "HORARIO_OCUPADO"
      );
    }
    throw error;
  }
  return data;
}

// "agendamento" é o registro já validado pela rota (telefone + código), com o serviço
async function reagendarHorario(agendamento, { data, hora }) {
  const horaPadrao = String(hora).slice(0, 5);
  if (!R.dataValida(data) || !HORARIOS_PADRAO.includes(horaPadrao)) {
    throw new ErroRegra("Data ou horário inválido.", 400, "DADOS_INVALIDOS");
  }
  if (data === agendamento.data && horaPadrao === String(agendamento.hora).slice(0, 5)) {
    throw new ErroRegra("Esse já é o horário do seu agendamento.", 422, "NADA_A_ALTERAR");
  }

  const duracaoMin = agendamento.servicos?.duracao_minutos ?? REGRAS.duracaoPadraoMin;
  const doDia = await agendamentosDoDia(data);
  const avaliacao = R.avaliarHorario({
    data, hora: horaPadrao, duracaoMin, agora: R.agoraBrasil(),
    agendamentosDoDia: doDia, ignorarId: agendamento.id,
  });
  if (!avaliacao.ok) throw new ErroRegra(avaliacao.mensagem, avaliacao.status, avaliacao.codigo);

  const { data: atualizado, error } = await supabase
    .from("agendamentos")
    .update({ data, hora: horaPadrao })
    .eq("id", agendamento.id)
    .select("*, servicos(nome, preco, duracao_minutos)")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ErroRegra("Esse horário já está ocupado.", 409, "HORARIO_OCUPADO");
    }
    throw error;
  }
  return atualizado;
}

module.exports = {
  HORARIOS_PADRAO,
  buscarOuCriarCliente,
  listarHorariosDisponiveis,
  criarAgendamento,
  buscarPorTelefoneECodigo,
  atualizarStatus,
  reagendarHorario,
};
