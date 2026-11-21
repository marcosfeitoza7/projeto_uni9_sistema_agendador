import { api } from "../api.js";
import { estado } from "../app.js";
import {
  $, esc, brl, duracao, hhmm, hojeISO, somarDias, rotuloData, dataHora,
  soDigitos, mascaraTelefone, icone, pintar, cabecalho, botaoVoltar, toast,
} from "../ui.js";

let ctx;   // { raiz, ativa } da tela atual
let s;     // estado da tela (campos, resultado, janelas abertas)

const ROTULO_STATUS = {
  confirmado: "Confirmado",
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

// Horários de hoje que já passaram não podem ser escolhidos
function jaPassou(data, hora) {
  if (data !== hojeISO()) return false;
  const agora = new Date();
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m <= agora.getHours() * 60 + agora.getMinutes();
}

// ---------- Desenho da tela ----------
function cartao() {
  const a = s.ag;
  const ativo = ["confirmado", "pendente"].includes(a.status);
  const servico = a.servicos || {};
  const avisoFinal = a.status === "cancelado"
    ? "Este agendamento foi cancelado."
    : "Este atendimento já foi concluído.";

  return `
    <p class="achou">${icone("circle-check", 20)} Agendamento encontrado</p>
    <section class="card resultado">
      <div class="res-topo">
        <h2 class="res-nome">${esc(a.clientes?.nome)}</h2>
        <span class="badge badge-${esc(a.status)}">${esc(ROTULO_STATUS[a.status] || a.status)}</span>
      </div>
      <p class="res-servico">${esc(servico.nome)}</p>
      <div class="divisor"></div>
      <div class="linha"><span>Data e horário</span><b>${esc(dataHora(a.data, a.hora))}</b></div>
      <div class="linha"><span>Profissional</span><b>Lash Studio</b></div>
      <div class="linha"><span>Duração</span><b>${duracao(servico.duracao_minutos)}</b></div>
      <div class="linha"><span>Valor</span><b>${brl(servico.preco)}</b></div>
      ${ativo ? `
        <div class="divisor"></div>
        <div class="res-acoes">
          <button type="button" class="acao acao-editar" id="editar">${icone("square-pen", 20)} Editar horário</button>
          <button type="button" class="acao acao-cancelar" id="cancelar">Cancelar agendamento</button>
        </div>` : `
        <p class="hint" style="margin-top:14px">${avisoFinal} Para marcar outro horário, faça um novo agendamento.</p>`}
    </section>`;
}

function modalCancelar() {
  const servico = s.ag.servicos || {};
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <h2 class="sheet-titulo" id="titulo-modal">Cancelar este agendamento?</h2>
        <p class="sheet-texto">${esc(servico.nome)}, ${esc(dataHora(s.ag.data, s.ag.hora))}. O horário ficará livre para outras pessoas.</p>
        <div class="stack-sm">
          <button type="button" class="btn btn-danger" id="confirmar-cancelar" ${s.trabalhando ? "disabled" : ""}>
            ${s.trabalhando ? "Cancelando..." : "Sim, cancelar agendamento"}
          </button>
          <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Manter agendamento</button>
        </div>
      </div>
    </div>`;
}

function modalEditar() {
  const e = s.edicao;
  const servico = s.ag.servicos || {};
  const hoje = hojeISO();

  let area;
  if (e.buscando) {
    area = `<div class="loading" style="padding:28px 0"><div class="spinner" aria-hidden="true"></div><p>Carregando horários...</p></div>`;
  } else if (e.erro) {
    area = `
      <p class="hint erro">${esc(e.erro)}</p>
      <button type="button" class="btn btn-outline" id="tentar-horarios" style="margin-top:12px">Tentar novamente</button>`;
  } else {
    area = `
      <div class="slots" role="group" aria-label="Horários">
        ${e.horarios.map((h) => {
          const hora = hhmm(h.hora);
          const livre = h.disponivel && !jaPassou(e.data, hora);
          return `<button type="button" class="slot ${e.hora === hora ? "is-selected" : ""}" data-hora="${hora}" ${livre ? "" : "disabled"}>${hora}</button>`;
        }).join("")}
      </div>`;
  }

  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <h2 class="sheet-titulo" id="titulo-modal">Escolher novo horário</h2>
        <p class="sheet-texto">${esc(servico.nome)} · ${duracao(servico.duracao_minutos)}</p>
        <div class="date-wrap">
          <button type="button" class="date-row" id="data-btn">
            ${icone("calendar-days", 24)}<span class="grow">${esc(rotuloData(e.data))}</span>${icone("chevron-down", 22)}
          </button>
          <input type="date" id="data-input" class="sr-only" tabindex="-1" aria-label="Escolher outra data"
                 value="${e.data}" min="${hoje}" max="${somarDias(hoje, 60)}">
        </div>
        <p class="sub-label">Horários de ${esc(rotuloData(e.data).toLowerCase())}</p>
        ${area}
        <div class="stack-sm" style="margin-top:22px">
          <button type="button" class="btn btn-primary" id="salvar-horario" ${e.hora && !s.trabalhando ? "" : "disabled"}>
            ${s.trabalhando ? "Salvando..." : "Confirmar novo horário"}
          </button>
          <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Voltar</button>
        </div>
      </div>
    </div>`;
}

function desenhar() {
  pintar(ctx.raiz, `
    ${cabecalho(botaoVoltar("#/"))}
    <main>
      <h1 class="title">Consultar agendamento</h1>
      <p class="lead">Informe seu telefone e o código de confirmação recebido na hora de agendar.</p>

      <form id="form-consulta" class="consulta-form" novalidate>
        <div class="field">
          <label for="telefone">Telefone</label>
          <div class="input-wrap">
            <input id="telefone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="15"
                   placeholder="(11) 90000-0000" value="${esc(s.telefone)}">
            <span class="ico-end">${icone("phone", 22)}</span>
          </div>
        </div>
        <div class="field">
          <label for="codigo">Código de confirmação</label>
          <div class="input-wrap">
            <input id="codigo" type="text" autocapitalize="characters" autocomplete="off" maxlength="6"
                   placeholder="Ex.: K2M8" value="${esc(s.codigo)}">
          </div>
        </div>
        <button type="submit" class="btn btn-primary" ${s.buscando ? "disabled" : ""}>
          ${s.buscando ? "Consultando..." : `Consultar ${icone("search", 22)}`}
        </button>
        ${s.erro ? `<p class="hint erro" role="alert">${esc(s.erro)}</p>` : ""}
      </form>

      ${s.ag ? cartao() : ""}
    </main>
    ${s.modal === "cancelar" ? modalCancelar() : ""}
    ${s.modal === "editar" ? modalEditar() : ""}`);
  ligar();
}

// ---------- Eventos ----------
function ligar() {
  const raiz = ctx.raiz;
  const telefone = $("#telefone", raiz);
  const codigo = $("#codigo", raiz);

  telefone.oninput = () => { telefone.value = mascaraTelefone(telefone.value); s.telefone = telefone.value; };
  codigo.oninput = () => {
    codigo.value = codigo.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    s.codigo = codigo.value;
  };
  $("#form-consulta", raiz).onsubmit = (ev) => { ev.preventDefault(); consultar(); };

  const editar = $("#editar", raiz);
  if (editar) editar.onclick = abrirEdicao;
  const cancelar = $("#cancelar", raiz);
  if (cancelar) cancelar.onclick = () => { s.modal = "cancelar"; desenhar(); };

  // Janelas (cancelar / editar horário)
  const fundo = $("#modal-fundo", raiz);
  if (fundo) fundo.onclick = (ev) => { if (ev.target === fundo && !s.trabalhando) fecharModal(); };
  const fechar = $("#fechar-modal", raiz);
  if (fechar) fechar.onclick = fecharModal;

  const confirmarCancelar = $("#confirmar-cancelar", raiz);
  if (confirmarCancelar) confirmarCancelar.onclick = cancelarAgendamento;

  if (s.modal === "editar") {
    const e = s.edicao;
    const entradaData = $("#data-input", raiz);
    $("#data-btn", raiz).onclick = () => {
      try { entradaData.showPicker(); } catch { entradaData.focus(); entradaData.click(); }
    };
    entradaData.onchange = () => {
      if (!entradaData.value) return;
      e.data = entradaData.value;
      e.hora = null;
      carregarHorarios();
    };
    raiz.querySelectorAll("[data-hora]").forEach((el) => {
      el.onclick = () => { e.hora = el.dataset.hora; desenhar(); };
    });
    const tentar = $("#tentar-horarios", raiz);
    if (tentar) tentar.onclick = carregarHorarios;
    $("#salvar-horario", raiz).onclick = salvarHorario;
  }
}

function fecharModal() {
  s.modal = null;
  s.edicao = null;
  desenhar();
}

// ---------- Ações ----------
async function consultar() {
  const digitos = soDigitos(s.telefone);
  s.ag = null;
  if (![10, 11].includes(digitos.length)) {
    s.erro = "Informe o telefone com DDD, com 10 ou 11 dígitos.";
    return desenhar();
  }
  if (s.codigo.length < 4) {
    s.erro = "Informe o código de confirmação (4 caracteres).";
    return desenhar();
  }

  s.buscando = true;
  s.erro = "";
  desenhar();
  try {
    const ag = await api.consultar(digitos, s.codigo);
    if (!ctx.ativa()) return;
    s.ag = ag;
    s.credenciais = { telefone: digitos, codigo: s.codigo };
  } catch (erro) {
    if (!ctx.ativa()) return;
    s.erro = erro.status === 404
      ? "Não encontramos nenhum agendamento com esses dados. Confira o telefone e o código."
      : erro.message;
  }
  s.buscando = false;
  desenhar();
}

async function cancelarAgendamento() {
  const c = s.credenciais;
  s.trabalhando = true;
  desenhar();
  try {
    const atualizado = await api.cancelar(s.ag.id, c.telefone, c.codigo);
    if (!ctx.ativa()) return;
    s.ag = { ...s.ag, status: atualizado.status };
    s.modal = null;
    s.trabalhando = false;
    toast("Agendamento cancelado");
    desenhar();
  } catch (erro) {
    if (!ctx.ativa()) return;
    s.trabalhando = false;
    s.modal = null;
    toast(erro.message, "erro");
    if (erro.status === 409) await consultar();   // já foi alterado: mostra a situação atual
    else desenhar();
  }
}

function abrirEdicao() {
  const hoje = hojeISO();
  s.edicao = { data: s.ag.data >= hoje ? s.ag.data : hoje, horarios: null, hora: null, buscando: true, erro: "" };
  s.modal = "editar";
  carregarHorarios();
}

async function carregarHorarios() {
  const e = s.edicao;
  const dataPedida = e.data;
  e.buscando = true;
  e.erro = "";
  e.horarios = null;
  desenhar();
  try {
    const horarios = await api.horarios(dataPedida);
    if (!ctx.ativa() || s.edicao !== e || e.data !== dataPedida) return;
    e.horarios = horarios;
  } catch (erro) {
    if (!ctx.ativa() || s.edicao !== e || e.data !== dataPedida) return;
    e.erro = erro.message;
  }
  e.buscando = false;
  desenhar();
}

async function salvarHorario() {
  const e = s.edicao;
  const c = s.credenciais;
  s.trabalhando = true;
  desenhar();
  try {
    const atualizado = await api.reagendar(s.ag.id, c.telefone, c.codigo, e.data, e.hora);
    if (!ctx.ativa()) return;
    s.ag = { ...s.ag, data: atualizado.data, hora: atualizado.hora };
    s.modal = null;
    s.edicao = null;
    s.trabalhando = false;
    toast("Horário atualizado com sucesso");
    desenhar();
  } catch (erro) {
    if (!ctx.ativa()) return;
    s.trabalhando = false;
    toast(erro.message, "erro");
    if (erro.status === 409) {   // horário foi ocupado: recarrega as opções
      e.hora = null;
      carregarHorarios();
    } else {
      desenhar();
    }
  }
}

// ---------- Entrada da tela ----------
export function renderizar(contexto) {
  ctx = contexto;
  // Vindo da confirmação de um agendamento feito agora, já preenche os campos
  const ultimo = estado.ultimoAgendamento;
  s = {
    telefone: ultimo ? mascaraTelefone(ultimo.telefone) : "",
    codigo: ultimo?.codigo_confirmacao || "",
    buscando: false, erro: "", ag: null, credenciais: null,
    modal: null, edicao: null, trabalhando: false,
  };
  if (ultimo) return consultar();
  desenhar();
}


