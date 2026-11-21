import { api } from "../api.js";
import { irPara } from "../app.js";
import { sessaoAtual, sair } from "../sessao.js";
import { $, esc, brl, duracao, icone, pintar, cabecalho, carregando, toast } from "../ui.js";

let ctx;
let s;   // { lista, carregando, erro, modal, alvo, form, trabalhando }

// Aceita "90", "90,50", "90.50" e "1.200,00"
function lerPreco(texto) {
  let t = String(texto ?? "").replace(/R\$|\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const precoParaCampo = (n) => String(n).replace(".", ",");

// ---------- Desenho ----------
function cartao(sv) {
  return `
    <section class="card" style="margin-top:14px;${sv.ativo ? "" : "opacity:.75"}">
      <div class="res-topo">
        <h2 class="res-nome" style="font-size:22px">${esc(sv.nome)}</h2>
        <span class="badge ${sv.ativo ? "badge-concluido" : "badge-cancelado"}">${sv.ativo ? "Ativo" : "Desativado"}</span>
      </div>
      <p class="res-servico">${duracao(sv.duracao_minutos)} · ${brl(sv.preco)}</p>
      <div class="divisor"></div>
      <div class="res-acoes">
        ${sv.ativo
          ? `<button type="button" class="acao acao-editar" data-editar="${esc(sv.id)}">${icone("square-pen", 20)} Editar</button>
             <button type="button" class="acao acao-cancelar" data-desativar="${esc(sv.id)}">Desativar</button>`
          : `<button type="button" class="acao acao-editar" data-reativar="${esc(sv.id)}">Reativar</button>`}
      </div>
    </section>`;
}

function modalForm() {
  const f = s.form;
  const editando = Boolean(s.alvo);
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal" style="max-height:92vh;overflow:auto">
        <h2 class="sheet-titulo" id="titulo-modal">${editando ? "Editar serviço" : "Novo serviço"}</h2>
        ${editando ? `<p class="sheet-texto">Quem já agendou mantém o nome, a duração e o valor combinados. A mudança vale só para novos agendamentos.</p>` : `<p class="sheet-texto">Ele aparece na tela de agendamento assim que você salvar.</p>`}
        <form id="form-servico" novalidate>
          <div class="field">
            <label for="f-nome">Nome</label>
            <div class="input-wrap"><input id="f-nome" type="text" maxlength="60" value="${esc(f.nome)}" placeholder="Ex.: Lash Lifting"></div>
          </div>
          <div class="field">
            <label for="f-duracao">Duração (minutos)</label>
            <div class="input-wrap"><input id="f-duracao" type="number" inputmode="numeric" min="15" max="480" step="5" value="${esc(f.duracao)}" placeholder="Ex.: 90"></div>
            <p class="hint" id="dica-duracao">${Number(f.duracao) > 0 ? esc(duracao(Number(f.duracao))) : "De 15 a 480, de 5 em 5."}</p>
          </div>
          <div class="field">
            <label for="f-preco">Preço (R$)</label>
            <div class="input-wrap"><input id="f-preco" type="text" inputmode="decimal" maxlength="10" value="${esc(f.preco)}" placeholder="Ex.: 150,00"></div>
          </div>
          ${f.erro ? `<p class="hint erro" role="alert">${esc(f.erro)}</p>` : ""}
          <div class="stack-sm" style="margin-top:8px">
            <button type="submit" class="btn btn-primary" ${s.trabalhando ? "disabled" : ""}>${s.trabalhando ? "Salvando..." : "Salvar serviço"}</button>
            <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;
}

function modalDesativar() {
  return `
    <div class="modal" id="modal-fundo">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <h2 class="sheet-titulo" id="titulo-modal">Desativar este serviço?</h2>
        <p class="sheet-texto"><b>${esc(s.alvo.nome)}</b> deixa de aparecer na tela de agendamento. Os agendamentos que já existem continuam valendo e o histórico não muda. Você pode reativar depois.</p>
        <div class="stack-sm">
          <button type="button" class="btn btn-danger" id="confirmar-desativar" ${s.trabalhando ? "disabled" : ""}>${s.trabalhando ? "Desativando..." : "Sim, desativar"}</button>
          <button type="button" class="btn btn-outline" id="fechar-modal" ${s.trabalhando ? "disabled" : ""}>Manter ativo</button>
        </div>
      </div>
    </div>`;
}

function desenhar() {
  let corpo;
  if (s.carregando) {
    corpo = carregando("Carregando serviços...");
  } else if (s.erro) {
    corpo = `
      <div class="card center">
        <p>${esc(s.erro)}</p>
        <button type="button" class="btn btn-outline" id="tentar" style="margin-top:14px">Tentar novamente</button>
      </div>`;
  } else if (!s.lista.length) {
    corpo = `<div class="card center" style="margin-top:18px"><p>Nenhum serviço cadastrado ainda.</p></div>`;
  } else {
    corpo = s.lista.map(cartao).join("");
  }

  const direita = `
    <nav class="nav-prof" aria-label="Menu da profissional">
      <a class="nav-item" href="#/agenda"><span class="nav-ico">${icone("calendar-days", 20)}</span><span class="nav-rot">Agenda</span></a>
      <a class="nav-item" href="#/painel"><span class="nav-ico">${icone("layout-dashboard", 20)}</span><span class="nav-rot">Painel</span></a>
      <button class="nav-item" type="button" id="sair"><span class="nav-ico">${icone("log-out", 20)}</span><span class="nav-rot">Sair</span></button>
    </nav>`;

  pintar(ctx.raiz, `
    ${cabecalho(direita)}
    <main>
      <h1 class="title">Serviços e preços</h1>
      <p class="lead">Mudanças de nome, duração ou preço valem só para novos agendamentos. Quem já agendou mantém o valor combinado.</p>
      <button type="button" class="btn btn-primary" id="novo" style="margin-top:18px">${icone("plus", 22)} Novo serviço</button>
      ${corpo}
    </main>
    ${s.modal === "form" ? modalForm() : ""}
    ${s.modal === "desativar" ? modalDesativar() : ""}`);
  ligar();
}

// ---------- Eventos ----------
function ligar() {
  const raiz = ctx.raiz;
  $("#sair", raiz).onclick = () => { sair(); irPara("/login"); };
  $("#novo", raiz).onclick = () => abrirForm(null);
  const tentar = $("#tentar", raiz);
  if (tentar) tentar.onclick = carregar;

  const achar = (id) => s.lista.find((x) => x.id === id);
  raiz.querySelectorAll("[data-editar]").forEach((b) => { b.onclick = () => abrirForm(achar(b.dataset.editar)); });
  raiz.querySelectorAll("[data-desativar]").forEach((b) => {
    b.onclick = () => { s.alvo = achar(b.dataset.desativar); s.modal = "desativar"; desenhar(); };
  });
  raiz.querySelectorAll("[data-reativar]").forEach((b) => { b.onclick = () => mudarAtivo(achar(b.dataset.reativar), true); });

  const fundo = $("#modal-fundo", raiz);
  if (fundo) fundo.onclick = (ev) => { if (ev.target === fundo && !s.trabalhando) fecharModal(); };
  const fechar = $("#fechar-modal", raiz);
  if (fechar) fechar.onclick = fecharModal;
  const confirmar = $("#confirmar-desativar", raiz);
  if (confirmar) confirmar.onclick = () => mudarAtivo(s.alvo, false);

  const form = $("#form-servico", raiz);
  if (form) {
    const nome = $("#f-nome", raiz);
    const dur = $("#f-duracao", raiz);
    const preco = $("#f-preco", raiz);
    nome.oninput = () => { s.form.nome = nome.value; };
    preco.oninput = () => { s.form.preco = preco.value; };
    dur.oninput = () => {
      s.form.duracao = dur.value;
      $("#dica-duracao", raiz).textContent = Number(dur.value) > 0 ? duracao(Number(dur.value)) : "De 15 a 480, de 5 em 5.";
    };
    form.onsubmit = (ev) => { ev.preventDefault(); if (!s.trabalhando) salvar(); };
  }
}

function abrirForm(servico) {
  s.alvo = servico;
  s.form = servico
    ? { nome: servico.nome, duracao: String(servico.duracao_minutos), preco: precoParaCampo(servico.preco), erro: "" }
    : { nome: "", duracao: "", preco: "", erro: "" };
  s.modal = "form";
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
    const lista = await api.admin.servicos(t);
    if (!ctx.ativa()) return;
    s.lista = lista;
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
  const corpo = {
    nome: s.form.nome.trim(),
    duracao_minutos: Number(s.form.duracao),
    preco: lerPreco(s.form.preco),
  };
  if (corpo.nome.length < 2) { s.form.erro = "Informe o nome do serviço."; return desenhar(); }
  if (!Number.isFinite(corpo.duracao_minutos) || corpo.duracao_minutos <= 0) { s.form.erro = "Informe a duração em minutos."; return desenhar(); }
  if (!Number.isFinite(corpo.preco) || corpo.preco <= 0) { s.form.erro = "Informe o preço, por exemplo 150,00."; return desenhar(); }

  const editando = Boolean(s.alvo);
  s.trabalhando = true;
  s.form.erro = "";
  desenhar();
  try {
    if (editando) await api.admin.editarServico(s.alvo.id, corpo, t);
    else await api.admin.criarServico(corpo, t);
  } catch (erro) {
    if (!ctx.ativa() || sessaoRecusada(erro)) return;
    s.trabalhando = false;
    s.form.erro = erro.message;
    return desenhar();
  }
  if (!ctx.ativa()) return;
  s.trabalhando = false;
  s.modal = null;
  s.alvo = null;
  s.form = null;
  toast(editando ? "Serviço atualizado. Agendamentos antigos não mudam." : "Serviço cadastrado");
  await carregar();
}

async function mudarAtivo(servico, ativo) {
  const t = token();
  if (!t) return;
  s.trabalhando = true;
  if (s.modal) desenhar();
  try {
    await api.admin.ativarServico(servico.id, ativo, t);
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
  toast(ativo ? "Serviço reativado" : "Serviço desativado");
  await carregar();
}

// ---------- Entrada da tela ----------
export async function renderizar(contexto) {
  ctx = contexto;
  if (!sessaoAtual()) return irPara("/login");
  s = { lista: [], carregando: true, erro: "", modal: null, alvo: null, form: null, trabalhando: false };
  await carregar();
}
