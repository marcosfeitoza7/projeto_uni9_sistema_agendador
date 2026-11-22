import { api } from "../api.js";
import { irPara } from "../app.js";
import { sessaoAtual, sair } from "../sessao.js";
import {
  $, esc, duracao, hojeISO, somarDias, soDigitos, mascaraTelefone,
  icone, pintar, cabecalho, carregando, toast, menuProfissional,
} from "../ui.js";

let ctx;
let s;   // { lista, periodo, status, busca, carregando, erro }

const ROTULO_STATUS = { confirmado: "Confirmado", pendente: "Pendente", concluido: "Concluído", cancelado: "Cancelado" };
const PERIODOS = [["tudo", "Tudo"], ["futuros", "A partir de hoje"], ["passados", "Já passaram"]];
const STATUS = [["", "Todos"], ["confirmado", "Confirmados"], ["concluido", "Concluídos"], ["cancelado", "Cancelados"]];

function rotuloDia(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const texto = new Date(a, m - 1, d)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function cartao(a) {
  return `
    <section class="card" style="margin-top:10px">
      <div class="res-topo">
        <h3 class="res-nome" style="font-size:20px">${esc(a.hora)} · ${esc(a.cliente)}</h3>
        <span class="badge badge-${esc(a.status)}">${esc(ROTULO_STATUS[a.status] || a.status)}</span>
      </div>
      <p class="res-servico" style="font-size:16px;margin:8px 0 4px">${esc(a.servico)} · ${esc(duracao(a.duracao_minutos))}</p>
      <p class="hint" style="margin-top:2px">${icone("phone", 14)} ${esc(mascaraTelefone(a.telefone))}</p>
    </section>`;
}

// Sem acento e em minúsculas, para a busca ignorar maiúsculas e acentos
const normalizar = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Aplica a busca por nome ou telefone (parte do número, com ou sem máscara)
function listaFiltrada() {
  const nome = normalizar(s.busca);
  const digitos = soDigitos(s.busca);
  if (!nome) return s.lista;
  return s.lista.filter((a) =>
    normalizar(a.cliente).includes(nome) || (digitos.length >= 2 && soDigitos(a.telefone).includes(digitos)));
}

function listaAgrupada(lista) {
  const grupos = [];
  for (const a of lista) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.data === a.data) ultimo.itens.push(a);
    else grupos.push({ data: a.data, itens: [a] });
  }
  return grupos.map((g) => `
    <h2 class="res-nome" style="font-size:18px;margin-top:22px">${esc(rotuloDia(g.data))}</h2>
    ${g.itens.map(cartao).join("")}`).join("");
}

// Contagem e lista (também redesenhada sozinha enquanto a profissional digita a busca)
function conteudoLista() {
  const lista = listaFiltrada();
  const total = lista.length;
  const ativos = lista.filter((a) => a.status !== "cancelado").length;
  if (!s.lista.length) return `<div class="card center" style="margin-top:18px"><p>Nenhum agendamento encontrado.</p></div>`;
  if (!total) return `<div class="card center" style="margin-top:18px"><p>Nenhum agendamento encontrado para essa busca.</p></div>`;
  const contagem = s.busca.trim() ? `${total} de ${s.lista.length}` : `${total}`;
  return `<p class="hint" style="margin-top:16px">${contagem} ${(s.busca.trim() ? s.lista.length : total) === 1 ? "agendamento" : "agendamentos"} (${ativos} ${ativos === 1 ? "ativo ou concluído" : "ativos ou concluídos"})${s.lista.length >= 500 ? ". Mostrando os 500 mais recentes." : ""}</p>${listaAgrupada(lista)}`;
}

function desenhar() {
  let corpo;
  if (s.carregando) {
    corpo = carregando("Carregando agendamentos...");
  } else if (s.erro) {
    corpo = `
      <div class="card center">
        <p>${esc(s.erro)}</p>
        <button type="button" class="btn btn-outline" id="tentar" style="margin-top:14px">Tentar novamente</button>
      </div>`;
  } else {
    corpo = conteudoLista();
  }

  pintar(ctx.raiz, `
    ${cabecalho(menuProfissional("agenda"))}
    <main>
      <a class="link-sm" href="#/agenda" style="display:inline-flex;gap:6px;align-items:center">${icone("arrow-left", 18)} Voltar para a agenda</a>
      <h1 class="title" style="margin-top:10px">Todos os agendamentos</h1>
      <div class="field" style="margin-top:18px">
        <label for="busca">Buscar cliente</label>
        <div class="input-wrap">
          <input id="busca" type="search" autocomplete="off" maxlength="60" placeholder="Nome ou telefone" value="${esc(s.busca)}">
          <span class="ico-end">${icone("search", 22)}</span>
        </div>
      </div>
      <div class="field">
        <label>Período</label>
        <div class="slots" style="grid-template-columns:1fr 1fr 1fr">
          ${PERIODOS.map(([v, r]) => `<button type="button" class="slot ${s.periodo === v ? "is-selected" : ""}" style="font-size:14px;padding:14px 4px" data-periodo="${v}">${r}</button>`).join("")}
        </div>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Situação</label>
        <div class="slots" style="grid-template-columns:1fr 1fr">
          ${STATUS.map(([v, r]) => `<button type="button" class="slot ${s.status === v ? "is-selected" : ""}" style="font-size:15px;padding:14px 4px" data-status="${v}">${r}</button>`).join("")}
        </div>
      </div>
      <div id="area-lista">${corpo}</div>
    </main>`);
  ligar();
}

function ligar() {
  const raiz = ctx.raiz;
  $("#sair", raiz).onclick = () => { sair(); irPara("/login"); };
  const tentar = $("#tentar", raiz);
  if (tentar) tentar.onclick = carregar;
  $("#busca", raiz).oninput = (ev) => {
    s.busca = ev.target.value;
    if (!s.carregando && !s.erro) $("#area-lista", raiz).innerHTML = conteudoLista();
  };
  raiz.querySelectorAll("[data-periodo]").forEach((b) => { b.onclick = () => { s.periodo = b.dataset.periodo; carregar(); }; });
  raiz.querySelectorAll("[data-status]").forEach((b) => { b.onclick = () => { s.status = b.dataset.status; carregar(); }; });
}

function token() {
  const sessao = sessaoAtual();
  if (!sessao) {
    sair();
    irPara("/login");
    return null;
  }
  return sessao.token;
}

async function carregar() {
  const t = token();
  if (!t) return;
  const filtros = {};
  const hoje = hojeISO();
  if (s.periodo === "futuros") filtros.de = hoje;
  if (s.periodo === "passados") filtros.ate = somarDias(hoje, -1);
  if (s.status) filtros.status = s.status;
  const pedido = JSON.stringify(filtros);

  s.carregando = true;
  s.erro = "";
  s.ultimoPedido = pedido;
  desenhar();
  try {
    const lista = await api.admin.agendamentos(filtros, t);
    if (!ctx.ativa() || s.ultimoPedido !== pedido) return;
    s.lista = lista;
  } catch (erro) {
    if (!ctx.ativa() || s.ultimoPedido !== pedido) return;
    if (erro.status === 401 || erro.status === 403) {
      sair();
      toast(erro.status === 401 ? "Sua sessão expirou. Entre novamente." : erro.message, "erro");
      return irPara("/login");
    }
    s.erro = erro.message;
  }
  s.carregando = false;
  desenhar();
}

export async function renderizar(contexto) {
  ctx = contexto;
  if (!sessaoAtual()) return irPara("/login");
  s = { lista: [], periodo: "tudo", status: "", busca: "", carregando: true, erro: "", ultimoPedido: "" };
  await carregar();
}
