const supabase = require("../supabaseClient");

const HORARIOS_PADRAO = ["09:00", "10:00", "11:30", "13:00", "14:00", "15:30", "16:00", "17:00"];

function gerarCodigoConfirmacao() {
  // 4 caracteres alfanuméricos, fáceis de digitar e de ler
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function normalizarTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

// Busca o cliente pelo telefone; cria um novo registro se não existir.
// É isso que evita duplicidade de cadastro sem exigir login.
async function buscarOuCriarCliente({ nome, telefone }) {
  const telefoneLimpo = normalizarTelefone(telefone);

  const { data: existente, error: erroBusca } = await supabase
    .from("clientes")
    .select("*")
    .eq("telefone", telefoneLimpo)
    .maybeSingle();

  if (erroBusca) throw erroBusca;
  if (existente) return existente;

  const { data: novo, error: erroCriacao } = await supabase
    .from("clientes")
    .insert({ nome, telefone: telefoneLimpo })
    .select()
    .single();

  if (erroCriacao) throw erroCriacao;
  return novo;
}

// Retorna os horários padrão do dia, marcando quais estão ocupados
async function listarHorariosDisponiveis(data) {
  const { data: ocupados, error } = await supabase
    .from("agendamentos")
    .select("hora")
    .eq("data", data)
    .neq("status", "cancelado");

  if (error) throw error;

  const horasOcupadas = new Set(ocupados.map((a) => a.hora.slice(0, 5)));

  return HORARIOS_PADRAO.map((hora) => ({
    hora,
    disponivel: !horasOcupadas.has(hora),
  }));
}

async function criarAgendamento({ nome, telefone, servico_id, data, hora }) {
  const cliente = await buscarOuCriarCliente({ nome, telefone });
  const codigo = gerarCodigoConfirmacao();

  const { data: agendamento, error } = await supabase
    .from("agendamentos")
    .insert({
      cliente_id: cliente.id,
      servico_id,
      data,
      hora,
      codigo_confirmacao: codigo,
      status: "confirmado",
    })
    .select("*, servicos(nome, preco, duracao_minutos)")
    .single();

  // O índice uq_horario_ativo é violado (código 23505) se outra pessoa
  // reservou o mesmo horário um instante antes.
  if (error) {
    if (error.code === "23505") {
      const conflito = new Error("Esse horário acabou de ser reservado por outra pessoa.");
      conflito.status = 409;
      throw conflito;
    }
    throw error;
  }

  return agendamento;
}

// Busca um agendamento validando telefone + código (a "senha" do cliente)
async function buscarPorTelefoneECodigo({ telefone, codigo }) {
  const telefoneLimpo = normalizarTelefone(telefone);

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefone", telefoneLimpo)
    .maybeSingle();

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

  if (error) throw error;
  return data;
}

async function reagendarHorario(id, { data, hora }) {
  const { data: atualizado, error } = await supabase
    .from("agendamentos")
    .update({ data, hora })
    .eq("id", id)
    .select("*, servicos(nome, preco, duracao_minutos)")
    .single();

  if (error) {
    if (error.code === "23505") {
      const conflito = new Error("Esse horário já está ocupado.");
      conflito.status = 409;
      throw conflito;
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
