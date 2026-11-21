import { api } from "../api.js";
import { irPara } from "../app.js";
import { sessaoAtual, sair } from "../sessao.js";
import {
  $, esc, brl, duracao, hhmm, hojeISO, somarDias, rotuloData, soDigitos, mascaraTelefone,
  icone, pintar, cabecalho, carregando, toast,
} from "../ui.js";

let ctx;
let s;   // { data, lista, carregando, erro, modal, alvo, trabalhando }

const ROTULO_STATUS = {
  confirmado: "Confirmado",
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const dataBR = (iso) => iso.split("-").reverse().join("/");

// Abre a conversa com a cliente já com a mensagem pronta
function linkWhatsApp(a) {
  const nomeServico = a.servicos?.nome || "atendimento";
  const texto =
    `Olá, ${a.clientes?.nome}! Infelizmente precisei cancelar o seu horário de ${nomeServico} ` +
    `em ${dataBR(a.data)}, às ${hhmm(a.hora)}. Podemos remarcar para outro dia?`;
  return `https://wa.me/55${soDigitos(a.clientes?.telefone)}?text=${encodeURIComponent(texto)}`;
}

// ---------- Desenho ----------
function resumo() {
  const validos = s.lista.filter((a) => a.status !== "cancelado");
  const total = validos.reduce((soma, a) => soma + Number(a.servicos?.preco || 0), 0);
  const n = validos.length;
  return `
    <div class="card" style="margin:18px 0 6px">
      <div class="linha"><span>Atendimentos</span><b>${n}</b></div>
      <div class="linha"><span>Valor previsto</span><b>${brl(total)}</b></div>
    </div>`;
}

function cartao(a) {
  const ativo = ["confirmado", "pendente"].includes(a.status);
  const servico = a.servicos || {};
  return `
    <section class="card" style="margin-top:14px">
      <div class="res-topo">
        <h2 class="res-nome" style="font-size:24px">${esc(hhmm(a.hora))} · ${esc(a.clientes?.nome)}</h2>
        <span class="badge badge-${esc(a.status)}">${esc(ROTULO_STATUS[a.status] || a.status)}</span>
      </div>
      <p class="res-servico">${esc(servico.nome)} · ${duracao(servico.duracao_minutos)} · ${brl(servico.preco)}</p>
      <p class="hint">${icone("phone", 14)} ${esc(mascaraTelefone(a.clientes?.telefone))}</p>
      ${ativo ? `
        <div class="divisor"></div>
        <div class="res-acoes">
          <button type="button" class="acao acao-editar" data-concluir="${esc(a.id)}">${icone("check", 20)} Concluir</button>
          <button type="button" class="acao acao-cancelar" data-cancelar="${esc(a.id)}">Cancelar</button>
        </div>` : ""}
    </section>`;
}

function modalCancelar() {
  const a = s.alvo;
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <h2 class="sheet-titulo" id="titulo-modal">Cancelar este atendimento?</h2>
        <p class="sheet-texto">${esc(a.clientes?.nome)}, ${esc(a.servicos?.nome)}, ${esc(rotuloData(a.data).toLowerCase())} às ${esc(hhmm(a.hora))}. O horário ficará livre para novos agendamentos.</p>
        <div class="stack-sm">
          <button type="button" class="btn btn-danger" id="confirmar-cancelar" ${s.trabalhando ? "disabled" : ""}>
            ${s.trabalhando ? "Cancelando..." : "Sim, cancelar atendimento"}
          </button>
          <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Manter atendimento</button>
        </div>
      </div>
    </div>`;
}

function modalAviso() {
  const a = s.alvo;
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <h2 class="sheet-titulo" id="titulo-modal">Avise a cliente</h2>
        <p class="sheet-texto">O atendimento foi cancelado, mas a cliente não recebe nenhuma notificação do sistema. Entre em contato com <b>${esc(a.clientes?.nome)}</b> pelo WhatsApp para avisar.</p>
        <div class="stack-sm">
          <a class="btn btn-primary" href="${esc(linkWhatsApp(a))}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
          <button type="button" class="btn btn-outline" id="fechar-modal">Já avisei / depois</button>
        </div>
      </div>
    </div>`;
}

function desenhar() {
  const hoje = hojeISO();
  let corpo;
  if (s.carregando) {
    corpo = carregando("Carregando agenda...");
  } else if (s.erro) {
    corpo = `
      <div class="card center">
        <p>${esc(s.erro)}</p>
        <button type="button" class="btn btn-outline" id="tentar" style="margin-top:14px">Tentar novamente</button>
      </div>`;
  } else if (!s.lista.length) {
    corpo = `<div class="card center" style="margin-top:18px"><p>Nenhum atendimento neste dia.</p></div>`;
  } else {
    corpo = resumo() + s.lista.map(cartao).join("");
  }

  const direita = `
    <div style="display:flex;gap:10px">
      <a class="icon-btn" href="#/painel" aria-label="Painel executivo">${icone("layout-dashboard", 20)}</a>
      <button type="button" class="icon-btn" id="sair" aria-label="Sair">${icone("log-out", 20)}</button>
    </div>`;

  pintar(ctx.raiz, `
    ${cabecalho(direita)}
    <main>
      <h1 class="title">Agenda do dia</h1>
      <div class="date-wrap" style="display:flex;gap:10px;align-items:stretch;margin-top:18px">
        <button type="button" class="icon-btn" id="dia-anterior" aria-label="Dia anterior">${icone("chevron-left", 20)}</button>
        <button type="button" class="date-row" id="data-btn" style="flex:1">
          ${icone("calendar-days", 24)}<span class="grow">${esc(rotuloData(s.data))}</span>${icone("chevron-down", 22)}
        </button>
        <button type="button" class="icon-btn" id="dia-seguinte" aria-label="Próximo dia">${icone("chevron-right", 20)}</button>
        <input type="date" id="data-input" class="sr-only" tabindex="-1" aria-label="Escolher outra data" value="${s.data}">
      </div>
      ${s.data !== hoje ? `<button type="button" class="link-sm" id="ir-hoje" style="margin-top:12px">Voltar para hoje</button>` : ""}
      ${corpo}
    </main>
    ${s.modal === "cancelar" ? modalCancelar() : ""}
    ${s.modal === "aviso" ? modalAviso() : ""}`);
  ligar();
}

// ---------- Eventos ----------
function ligar() {
  const raiz = ctx.raiz;
  $("#sair", raiz).onclick = () => { sair(); irPara("/login"); };

  const entradaData = $("#data-input", raiz);
  $("#data-btn", raiz).onclick = () => {
    try { entradaData.showPicker(); } catch { entradaData.focus(); entradaData.click(); }
  };
  entradaData.onchange = () => { if (entradaData.value) mudarData(entradaData.value); };
  $("#dia-anterior", raiz).onclick = () => mudarData(somarDias(s.data, -1));
  $("#dia-seguinte", raiz).onclick = () => mudarData(somarDias(s.data, 1));
  const irHoje = $("#ir-hoje", raiz);
  if (irHoje) irHoje.onclick = () => mudarData(hojeISO());
  const tentar = $("#tentar", raiz);
  if (tentar) tentar.onclick = carregar;

  raiz.querySelectorAll("[data-concluir]").forEach((b) => {
    b.onclick = () => concluir(b.dataset.concluir);
  });
  raiz.querySelectorAll("[data-cancelar]").forEach((b) => {
    b.onclick = () => {
      s.alvo = s.lista.find((a) => a.id === b.dataset.cancelar);
      s.modal = "cancelar";
      desenhar();
    };
  });

  const fundo = $("#modal-fundo", raiz);
  if (fundo) fundo.onclick = (ev) => { if (ev.target === fundo && !s.trabalhando) fecharModal(); };
  const fechar = $("#fechar-modal", raiz);
  if (fechar) fechar.onclick = fecharModal;
  const confirmar = $("#confirmar-cancelar", raiz);
  if (confirmar) confirmar.onclick = cancelar;
}

function fecharModal() {
  s.modal = null;
  s.alvo = null;
  desenhar();
}

function mudarData(data) {
  s.data = data;
  carregar();
}

// ---------- Dados ----------
function token() {
  const sessao = sessaoAtual();
  if (!sessao) {
    sair();
    irPara("/login");
    return null;
  }
  return sessao.token;
}

// Sessão recusada pelo servidor: volta para o login
function tratarErro(erro) {
  if (erro.status === 401) {
    sair();
    toast("Sua sessão expirou. Entre novamente.", "erro");
    irPara("/login");
    return true;
  }
  return false;
}

async function carregar() {
  const t = token();
  if (!t) return;
  const dataPedida = s.data;
  s.carregando = true;
  s.erro = "";
  desenhar();
  try {
    const lista = await api.admin.agenda(dataPedida, t);
    if (!ctx.ativa() || s.data !== dataPedida) return;
    s.lista = lista;
  } catch (erro) {
    if (!ctx.ativa()) return;
    if (tratarErro(erro)) return;
    s.erro = erro.message;
  }
  s.carregando = false;
  desenhar();
}

async function alterarStatus(id, status) {
  const t = token();
  if (!t) return null;
  try {
    return await api.admin.status(id, status, t);
  } catch (erro) {
    if (!ctx.ativa()) return null;
    if (!tratarErro(erro)) toast(erro.message, "erro");
    return null;
  }
}

async function concluir(id) {
  const atualizado = await alterarStatus(id, "concluido");
  if (!atualizado || !ctx.ativa()) return;
  s.lista = s.lista.map((a) => (a.id === id ? { ...a, status: "concluido" } : a));
  toast("Atendimento concluído");
  desenhar();
}

async function cancelar() {
  const alvo = s.alvo;
  s.trabalhando = true;
  desenhar();
  const atualizado = await alterarStatus(alvo.id, "cancelado");
  if (!ctx.ativa()) return;
  s.trabalhando = false;
  if (!atualizado) {
    s.modal = null;
    s.alvo = null;
    return desenhar();
  }
  s.lista = s.lista.map((a) => (a.id === alvo.id ? { ...a, status: "cancelado" } : a));
  s.alvo = { ...alvo, status: "cancelado" };
  s.modal = "aviso";   // lembra a profissional de avisar a cliente
  desenhar();
}

// ---------- Entrada da tela ----------
export async function renderizar(contexto) {
  ctx = contexto;
  if (!sessaoAtual()) return irPara("/login");
  s = { data: hojeISO(), lista: [], carregando: true, erro: "", modal: null, alvo: null, trabalhando: false };
  await carregar();
}
