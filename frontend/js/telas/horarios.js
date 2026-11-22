import { api } from "../api.js";
import { irPara } from "../app.js";
import { sessaoAtual, sair } from "../sessao.js";
import {
  $, esc, hhmm, hojeISO, soDigitos, mascaraTelefone, rotuloData, duracao,
  icone, pintar, cabecalho, carregando, toast, menuProfissional,
} from "../ui.js";

let ctx;
let s;   // { cfg, carregando, erro, modal, alvo, form, trabalhando }

const NOMES_DIA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];   // começa na segunda

const dataBR = (iso) => iso.split("-").reverse().join("/");
const resumoExpediente = (x) => (x.aberto ? `${hhmm(x.abre)} às ${hhmm(x.fecha)}` : "Fechado");

function nomeDaData(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const texto = new Date(a, m - 1, d)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Mensagem pronta para a cliente (horário que ficou fora do novo expediente)
function linkWhatsApp(a) {
  const texto =
    `Olá, ${a.cliente}! Precisei mudar o meu horário de atendimento e o seu horário de ${a.servico} ` +
    `em ${dataBR(a.data)}, às ${a.hora}, ficou fora do novo expediente. Podemos combinar outro horário?`;
  return `https://wa.me/55${soDigitos(a.telefone)}?text=${encodeURIComponent(texto)}`;
}

function linkWhatsAppCancelado(a) {
  const texto =
    `Olá, ${a.cliente}! Infelizmente precisei cancelar o seu horário de ${a.servico} ` +
    `em ${dataBR(a.data)}, às ${a.hora}. Podemos remarcar para outro dia?`;
  return `https://wa.me/55${soDigitos(a.telefone)}?text=${encodeURIComponent(texto)}`;
}

// ---------- Desenho ----------
function listaAfetados(lista, comAcoes) {
  return lista.map((a) => `
    <div style="padding:12px 0;border-top:1px solid var(--line)">
      <p style="font-weight:600">${esc(dataBR(a.data))} · ${esc(a.hora)} · ${esc(a.cliente)}</p>
      <p class="hint" style="margin-top:2px">${esc(a.servico)} · ${esc(duracao(a.duracao_minutos))} · ${icone("phone", 14)} ${esc(mascaraTelefone(a.telefone))}</p>
      ${comAcoes ? `
        <div class="res-acoes" style="margin-top:4px">
          <a class="acao acao-editar" href="${esc(linkWhatsApp(a))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <button type="button" class="acao acao-cancelar" data-cancelar="${esc(a.id)}">Cancelar agendamento</button>
        </div>` : ""}
    </div>`).join("");
}

function avisoConflitos() {
  const lista = s.cfg.conflitos;
  if (!lista.length) return "";
  return `
    <section class="card" style="margin-top:18px;border-color:var(--rose)">
      <h2 class="res-nome" style="font-size:20px">${icone("triangle-alert", 20)} ${lista.length} ${lista.length === 1 ? "agendamento fora do horário" : "agendamentos fora do horário"}</h2>
      <p class="hint" style="margin-top:6px">Estes agendamentos continuam valendo, mas ficaram fora do horário de funcionamento. Nada foi cancelado. Se precisar, avise a cliente pelo WhatsApp ou cancele o agendamento.</p>
      ${listaAfetados(lista, true)}
    </section>`;
}

function linhaSemana(dia) {
  const x = s.cfg.semana.find((d) => d.dia_semana === dia) || { dia_semana: dia, aberto: false };
  return `
    <div class="linha" style="align-items:center">
      <span><b style="color:var(--ink)">${NOMES_DIA[dia]}</b><br><span class="hint" style="margin:0">${esc(resumoExpediente(x))}</span></span>
      <button type="button" class="acao acao-editar" data-semana="${dia}">${icone("square-pen", 18)} Editar</button>
    </div>`;
}

function cartaoData(x) {
  return `
    <section class="card" style="margin-top:12px">
      <div class="res-topo">
        <h3 class="res-nome" style="font-size:19px">${esc(nomeDaData(x.data))}</h3>
        <span class="badge ${x.aberto ? "badge-concluido" : "badge-cancelado"}">${esc(resumoExpediente(x))}</span>
      </div>
      ${x.motivo ? `<p class="hint">${esc(x.motivo)}</p>` : ""}
      <div class="divisor"></div>
      <div class="res-acoes">
        <button type="button" class="acao acao-editar" data-data="${esc(x.data)}">${icone("square-pen", 18)} Editar</button>
        <button type="button" class="acao acao-cancelar" data-remover="${esc(x.data)}">Remover</button>
      </div>
    </section>`;
}

function campoExpediente(f) {
  return `
    <div class="field">
      <label>O studio abre neste dia?</label>
      <div class="slots" style="grid-template-columns:1fr 1fr">
        <button type="button" class="slot ${f.aberto ? "is-selected" : ""}" data-aberto="1">Abre</button>
        <button type="button" class="slot ${f.aberto ? "" : "is-selected"}" data-aberto="0">Fechado</button>
      </div>
    </div>
    ${f.aberto ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field">
          <label for="f-abre">Abre às</label>
          <div class="input-wrap"><input id="f-abre" type="time" value="${esc(f.abre)}"></div>
        </div>
        <div class="field">
          <label for="f-fecha">Fecha às</label>
          <div class="input-wrap"><input id="f-fecha" type="time" value="${esc(f.fecha)}"></div>
        </div>
      </div>
      <p class="hint" style="margin-top:-10px;margin-bottom:18px">Os horários para as clientes são gerados de hora em hora a partir da abertura.</p>` : ""}`;
}

function modalSemana() {
  const f = s.form;
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal" style="max-height:92vh;overflow:auto">
        <h2 class="sheet-titulo" id="titulo-modal">${esc(NOMES_DIA[f.dia])}</h2>
        <p class="sheet-texto">Vale para todas as semanas. Agendamentos que já existem não são alterados nem cancelados.</p>
        <form id="form-horario" novalidate>
          ${campoExpediente(f)}
          ${f.erro ? `<p class="hint erro" role="alert">${esc(f.erro)}</p>` : ""}
          <div class="stack-sm" style="margin-top:8px">
            <button type="submit" class="btn btn-primary" ${s.trabalhando ? "disabled" : ""}>${s.trabalhando ? "Salvando..." : "Salvar horário"}</button>
            <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;
}

function modalData() {
  const f = s.form;
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal" style="max-height:92vh;overflow:auto">
        <h2 class="sheet-titulo" id="titulo-modal">${f.editando ? "Editar data especial" : "Nova data especial"}</h2>
        <p class="sheet-texto">Para folga, meio período ou um dia extra. Vale só para esta data. Só dá para salvar se os agendamentos do dia continuarem dentro do novo horário.</p>
        <form id="form-horario" novalidate>
          <div class="field">
            <label for="f-data">Data</label>
            <div class="input-wrap"><input id="f-data" type="date" min="${hojeISO()}" value="${esc(f.data)}" ${f.editando ? "disabled" : ""}></div>
          </div>
          ${campoExpediente(f)}
          <div class="field">
            <label for="f-motivo">Motivo (opcional)</label>
            <div class="input-wrap"><input id="f-motivo" type="text" maxlength="80" value="${esc(f.motivo)}" placeholder="Ex.: Consulta médica"></div>
          </div>
          ${f.erro ? `<p class="hint erro" role="alert">${esc(f.erro)}</p>` : ""}
          ${f.afetados?.length ? `<div style="margin-bottom:14px">${listaAfetados(f.afetados, false)}</div>` : ""}
          <div class="stack-sm" style="margin-top:8px">
            <button type="submit" class="btn btn-primary" ${s.trabalhando ? "disabled" : ""}>${s.trabalhando ? "Salvando..." : "Salvar data"}</button>
            <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;
}

function modalRemover() {
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <h2 class="sheet-titulo" id="titulo-modal">Remover esta data?</h2>
        <p class="sheet-texto"><b>${esc(nomeDaData(s.alvo.data))}</b> volta a seguir o horário normal da semana.</p>
        <div class="stack-sm">
          <button type="button" class="btn btn-danger" id="confirmar-remover" ${s.trabalhando ? "disabled" : ""}>${s.trabalhando ? "Removendo..." : "Sim, remover"}</button>
          <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Manter</button>
        </div>
      </div>
    </div>`;
}

function modalCancelar() {
  const a = s.alvo;
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <h2 class="sheet-titulo" id="titulo-modal">Cancelar este agendamento?</h2>
        <p class="sheet-texto">${esc(a.cliente)}, ${esc(a.servico)}, ${esc(dataBR(a.data))} às ${esc(a.hora)}. O horário ficará livre e a cliente não recebe nenhuma notificação do sistema.</p>
        <div class="stack-sm">
          <button type="button" class="btn btn-danger" id="confirmar-cancelar" ${s.trabalhando ? "disabled" : ""}>${s.trabalhando ? "Cancelando..." : "Sim, cancelar agendamento"}</button>
          <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Manter agendamento</button>
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
        <p class="sheet-texto">O agendamento foi cancelado, mas a cliente não recebe nenhuma notificação do sistema. Entre em contato com <b>${esc(a.cliente)}</b> pelo WhatsApp.</p>
        <div class="stack-sm">
          <a class="btn btn-primary" href="${esc(linkWhatsAppCancelado(a))}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
          <button type="button" class="btn btn-outline" id="fechar-modal">Já avisei / depois</button>
        </div>
      </div>
    </div>`;
}

function desenhar() {
  let corpo;
  if (s.carregando) {
    corpo = carregando("Carregando horários...");
  } else if (s.erro) {
    corpo = `
      <div class="card center">
        <p>${esc(s.erro)}</p>
        <button type="button" class="btn btn-outline" id="tentar" style="margin-top:14px">Tentar novamente</button>
      </div>`;
  } else {
    corpo = `
      ${avisoConflitos()}
      <h2 class="res-nome" style="font-size:22px;margin-top:26px">Semana</h2>
      <section class="card" style="margin-top:10px;padding-top:8px;padding-bottom:8px">
        ${ORDEM_SEMANA.map(linhaSemana).join("")}
      </section>
      <h2 class="res-nome" style="font-size:22px;margin-top:26px">Datas especiais</h2>
      <p class="hint" style="margin-top:4px">Folga, meio período ou dia extra em uma data específica.</p>
      <button type="button" class="btn btn-outline" id="nova-data" style="margin-top:12px">${icone("plus", 22)} Nova data especial</button>
      ${s.cfg.excecoes.length ? s.cfg.excecoes.map(cartaoData).join("") : `<p class="hint" style="margin-top:14px">Nenhuma data especial cadastrada.</p>`}`;
  }

  pintar(ctx.raiz, `
    ${cabecalho(menuProfissional("horarios"))}
    <main>
      <h1 class="title">Horários de funcionamento</h1>
      <p class="lead">Defina quando o studio atende. As clientes só veem horários dentro do que você configurar aqui.</p>
      ${corpo}
    </main>
    ${s.modal === "semana" ? modalSemana() : ""}
    ${s.modal === "data" ? modalData() : ""}
    ${s.modal === "remover" ? modalRemover() : ""}
    ${s.modal === "cancelar" ? modalCancelar() : ""}
    ${s.modal === "aviso" ? modalAviso() : ""}`);
  ligar();
}

// ---------- Eventos ----------
function ligar() {
  const raiz = ctx.raiz;
  $("#sair", raiz).onclick = () => { sair(); irPara("/login"); };
  const tentar = $("#tentar", raiz);
  if (tentar) tentar.onclick = carregar;
  const nova = $("#nova-data", raiz);
  if (nova) nova.onclick = () => abrirData(null);

  raiz.querySelectorAll("[data-semana]").forEach((b) => { b.onclick = () => abrirSemana(Number(b.dataset.semana)); });
  raiz.querySelectorAll("[data-data]").forEach((b) => {
    b.onclick = () => abrirData(s.cfg.excecoes.find((x) => x.data === b.dataset.data));
  });
  raiz.querySelectorAll("[data-remover]").forEach((b) => {
    b.onclick = () => { s.alvo = s.cfg.excecoes.find((x) => x.data === b.dataset.remover); s.modal = "remover"; desenhar(); };
  });
  raiz.querySelectorAll("[data-cancelar]").forEach((b) => {
    b.onclick = () => { s.alvo = s.cfg.conflitos.find((x) => x.id === b.dataset.cancelar); s.modal = "cancelar"; desenhar(); };
  });

  const fundo = $("#modal-fundo", raiz);
  if (fundo) fundo.onclick = (ev) => { if (ev.target === fundo && !s.trabalhando) fecharModal(); };
  const fechar = $("#fechar-modal", raiz);
  if (fechar) fechar.onclick = fecharModal;
  const remover = $("#confirmar-remover", raiz);
  if (remover) remover.onclick = removerData;
  const cancelar = $("#confirmar-cancelar", raiz);
  if (cancelar) cancelar.onclick = cancelarAgendamento;

  const form = $("#form-horario", raiz);
  if (form) {
    raiz.querySelectorAll("[data-aberto]").forEach((b) => {
      b.onclick = () => { s.form.aberto = b.dataset.aberto === "1"; desenhar(); };
    });
    const abre = $("#f-abre", raiz);
    const fecha = $("#f-fecha", raiz);
    if (abre) abre.oninput = () => { s.form.abre = abre.value; };
    if (fecha) fecha.oninput = () => { s.form.fecha = fecha.value; };
    const data = $("#f-data", raiz);
    if (data) data.oninput = () => { s.form.data = data.value; };
    const motivo = $("#f-motivo", raiz);
    if (motivo) motivo.oninput = () => { s.form.motivo = motivo.value; };
    form.onsubmit = (ev) => { ev.preventDefault(); if (!s.trabalhando) salvar(); };
  }
}

function abrirSemana(dia) {
  const x = s.cfg.semana.find((d) => d.dia_semana === dia);
  s.form = { tipo: "semana", dia, aberto: x ? x.aberto : false, abre: x?.abre || "09:00", fecha: x?.fecha || "18:00", erro: "" };
  s.modal = "semana";
  desenhar();
}

function abrirData(x) {
  s.form = x
    ? { tipo: "data", editando: true, data: x.data, aberto: x.aberto, abre: x.abre || "09:00", fecha: x.fecha || "18:00", motivo: x.motivo || "", erro: "", afetados: [] }
    : { tipo: "data", editando: false, data: "", aberto: false, abre: "09:00", fecha: "13:00", motivo: "", erro: "", afetados: [] };
  s.modal = "data";
  desenhar();
}

function fecharModal() {
  s.modal = null;
  s.alvo = null;
  s.form = null;
  desenhar();
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

// true = sessão recusada (já mandou para o login)
function sessaoRecusada(erro) {
  if (erro.status === 401 || erro.status === 403) {
    sair();
    toast(erro.status === 401 ? "Sua sessão expirou. Entre novamente." : erro.message, "erro");
    irPara("/login");
    return true;
  }
  return false;
}

async function carregar() {
  const t = token();
  if (!t) return;
  s.carregando = true;
  s.erro = "";
  desenhar();
  try {
    const cfg = await api.admin.horarios(t);
    if (!ctx.ativa()) return;
    s.cfg = cfg;
  } catch (erro) {
    if (!ctx.ativa() || sessaoRecusada(erro)) return;
    s.erro = erro.message;
  }
  s.carregando = false;
  desenhar();
}

async function salvar() {
  const t = token();
  if (!t) return;
  const f = s.form;
  const corpo = f.aberto ? { aberto: true, abre: f.abre, fecha: f.fecha } : { aberto: false };
  if (f.aberto && (!f.abre || !f.fecha)) { f.erro = "Informe os horários de abrir e fechar."; return desenhar(); }
  if (f.aberto && f.abre >= f.fecha) { f.erro = "O horário de abrir precisa ser antes do de fechar."; return desenhar(); }
  if (f.tipo === "data") {
    if (!f.data) { f.erro = "Escolha a data."; return desenhar(); }
    if (f.data < hojeISO()) { f.erro = "Escolha uma data a partir de hoje."; return desenhar(); }
    corpo.motivo = f.motivo.trim();
  }

  s.trabalhando = true;
  f.erro = "";
  f.afetados = [];
  desenhar();
  let resposta;
  try {
    resposta = f.tipo === "semana"
      ? await api.admin.salvarDiaSemana(f.dia, corpo, t)
      : await api.admin.salvarDataEspecial(f.data, corpo, t);
  } catch (erro) {
    if (!ctx.ativa() || sessaoRecusada(erro)) return;
    s.trabalhando = false;
    f.erro = erro.message;
    f.afetados = erro.dados?.agendamentos || [];
    return desenhar();
  }
  if (!ctx.ativa()) return;
  s.trabalhando = false;
  s.modal = null;
  s.form = null;
  const fora = resposta?.conflitos?.length || 0;
  toast(fora ? `Horário salvo. ${fora} ${fora === 1 ? "agendamento ficou" : "agendamentos ficaram"} fora do horário.` : "Horário salvo");
  await carregar();
}

async function removerData() {
  const t = token();
  if (!t) return;
  s.trabalhando = true;
  desenhar();
  try {
    await api.admin.removerDataEspecial(s.alvo.data, t);
  } catch (erro) {
    if (!ctx.ativa() || sessaoRecusada(erro)) return;
    s.trabalhando = false;
    s.modal = null;
    s.alvo = null;
    toast(erro.message, "erro");
    return desenhar();
  }
  if (!ctx.ativa()) return;
  s.trabalhando = false;
  s.modal = null;
  s.alvo = null;
  toast("Data removida");
  await carregar();
}

async function cancelarAgendamento() {
  const t = token();
  if (!t) return;
  const alvo = s.alvo;
  s.trabalhando = true;
  desenhar();
  try {
    await api.admin.status(alvo.id, "cancelado", t);
  } catch (erro) {
    if (!ctx.ativa() || sessaoRecusada(erro)) return;
    s.trabalhando = false;
    s.modal = null;
    s.alvo = null;
    toast(erro.message, "erro");
    return desenhar();
  }
  if (!ctx.ativa()) return;
  s.trabalhando = false;
  s.cfg.conflitos = s.cfg.conflitos.filter((x) => x.id !== alvo.id);
  s.alvo = alvo;
  s.modal = "aviso";   // lembra a profissional de avisar a cliente
  desenhar();
}

// ---------- Entrada da tela ----------
export async function renderizar(contexto) {
  ctx = contexto;
  if (!sessaoAtual()) return irPara("/login");
  s = { cfg: { semana: [], excecoes: [], conflitos: [] }, carregando: true, erro: "", modal: null, alvo: null, form: null, trabalhando: false };
  await carregar();
}
