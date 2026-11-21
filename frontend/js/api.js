import { API_URL } from "./config.js";

export class ApiError extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

async function requisitar(caminho, { metodo = "GET", corpo, token } = {}) {
  const cabecalhos = {};
  if (corpo) cabecalhos["Content-Type"] = "application/json";
  if (token) cabecalhos["Authorization"] = `Bearer ${token}`;

  let resposta;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Tente novamente em instantes.", 0);
  }

  let dados = null;
  try {
    dados = await resposta.json();
  } catch {
    // resposta sem corpo
  }

  if (!resposta.ok) {
    throw new ApiError(dados?.erro || "Algo deu errado. Tente novamente.", resposta.status);
  }
  return dados;
}

// Uma função para cada rota do backend
export const api = {
  // Área do cliente (sem login)
  servicos: () => requisitar("/api/servicos"),
  horarios: (data, servicoId, ignorarId) => {
    const q = new URLSearchParams({ data });
    if (servicoId) q.set("servico_id", servicoId);
    if (ignorarId) q.set("ignorar", ignorarId);
    return requisitar(`/api/agendamentos/horarios?${q}`);
  },
  agendar: (corpo) => requisitar("/api/agendamentos", { metodo: "POST", corpo }),
  consultar: (telefone, codigo) =>
    requisitar(
      `/api/agendamentos/consulta?telefone=${encodeURIComponent(telefone)}&codigo=${encodeURIComponent(codigo)}`
    ),
  cancelar: (id, telefone, codigo) =>
    requisitar(`/api/agendamentos/${id}/cancelar`, { metodo: "PATCH", corpo: { telefone, codigo } }),
  reagendar: (id, telefone, codigo, data, hora) =>
    requisitar(`/api/agendamentos/${id}/reagendar`, {
      metodo: "PATCH",
      corpo: { telefone, codigo, data, hora },
    }),

  // Área da profissional (exige o token do login)
  admin: {
    agenda: (data, token) => requisitar(`/api/admin/agenda?data=${data}`, { token }),
    status: (id, status, token) =>
      requisitar(`/api/admin/agendamentos/${id}/status`, { metodo: "PATCH", corpo: { status }, token }),
    dashboard: (inicio, fim, token) =>
      requisitar(`/api/admin/dashboard?inicio=${inicio}&fim=${fim}`, { token }),
    servicos: (token) => requisitar("/api/admin/servicos", { token }),
    criarServico: (corpo, token) => requisitar("/api/admin/servicos", { metodo: "POST", corpo, token }),
    editarServico: (id, corpo, token) =>
      requisitar(`/api/admin/servicos/${id}`, { metodo: "PUT", corpo, token }),
    ativarServico: (id, ativo, token) =>
      requisitar(`/api/admin/servicos/${id}/ativo`, { metodo: "PATCH", corpo: { ativo }, token }),
  },
};
