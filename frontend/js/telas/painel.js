import { api } from "../api.js";
import { irPara } from "../app.js";
import { sessaoAtual, sair } from "../sessao.js";
import { $, esc, brl, hojeISO, somarDias, icone, pintar, cabecalho, carregando, toast, menuProfissional } from "../ui.js";

const CHART_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js";

const PERIODOS = [
  { chave: "mes", rotulo: "Este mês" },
  { chave: "anterior", rotulo: "Mês passado" },
  { chave: "90dias", rotulo: "Últimos 90 dias" },
  { chave: "custom", rotulo: "Outro período" },
];

let ctx;
let s;                 // { chave, inicio, fim, dados, carregando, erro }
let graficos = [];     // gráficos desenhados (precisam ser destruídos ao redesenhar)
let promessaChart = null;

const dataBR = (iso) => iso.split("-").reverse().join("/");
const doisDigitos = (n) => String(n).padStart(2, "0");

// ---------- Períodos ----------
function intervalo(chave) {
  const hoje = hojeISO();
  const [a, m] = hoje.split("-").map(Number);
  const mesInteiro = (ano, mes) => {
    const ultimo = new Date(ano, mes, 0).getDate();
    return { inicio: `${ano}-${doisDigitos(mes)}-01`, fim: `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimo)}` };
  };
  if (chave === "mes") return mesInteiro(a, m);
  if (chave === "anterior") return m === 1 ? mesInteiro(a - 1, 12) : mesInteiro(a, m - 1);
  if (chave === "90dias") return { inicio: somarDias(hoje, -89), fim: hoje };
  return { inicio: s.inicio, fim: s.fim };
}

// ---------- Chart.js (carregado só quando a tela abre) ----------
function carregarChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!promessaChart) {
    promessaChart = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = CHART_URL;
      el.onload = () => resolve(window.Chart);
      el.onerror = () => { promessaChart = null; reject(new Error("Chart.js indisponível")); };
      document.head.appendChild(el);
    });
  }
  return promessaChart;
}

const cor = (nome, reserva) =>
  getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || reserva;

// ---------- Desenho ----------
function cartaoNumero(rotulo, valor, dica = "") {
  return `
    <div class="card" style="padding:18px">
      <p class="hint" style="margin:0">${esc(rotulo)}</p>
      <p style="font-family:var(--font-display);font-weight:600;font-size:28px;line-height:1.15;margin-top:6px">${esc(valor)}</p>
      ${dica ? `<p class="hint">${esc(dica)}</p>` : ""}
    </div>`;
}

function conteudo() {
  if (s.carregando) return carregando("Carregando painel...");
  if (s.erro) {
    return `
      <div class="card center">
        <p>${esc(s.erro)}</p>
        <button type="button" class="btn btn-outline" id="tentar" style="margin-top:14px">Tentar novamente</button>
      </div>`;
  }

  const d = s.dados;
  const total = Object.values(d.statusDaAgenda).reduce((a, b) => a + b, 0);
  if (!total) {
    return `<div class="card center" style="margin-top:18px"><p>Nenhum agendamento neste período.</p></div>`;
  }

  const ranking = d.servicosMaisContratados;
  const lista = ranking.length
    ? `<ol class="hint" style="margin:12px 0 0;padding-left:20px">${ranking
        .map((r) => `<li>${esc(r.nome)}: <b>${r.quantidade}</b></li>`)
        .join("")}</ol>`
    : "";

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px">
      ${cartaoNumero("Faturamento", brl(d.faturamento), "Só atendimentos concluídos")}
      ${cartaoNumero("Serviços prestados", String(d.servicosPrestados), "Atendimentos concluídos")}
    </div>
    <div style="margin-top:12px">${cartaoNumero("Faturamento pendente", brl(d.faturamentoPendente || 0), `${d.atendimentosPendentes || 0} ${d.atendimentosPendentes === 1 ? "atendimento agendado" : "atendimentos agendados"}, ainda a receber`)}</div>
    <div style="margin-top:12px">${cartaoNumero("Faturamento cancelado", brl(d.faturamentoCancelado || 0), `${d.atendimentosCancelados || 0} ${d.atendimentosCancelados === 1 ? "atendimento cancelado" : "atendimentos cancelados"}, valor que deixou de entrar`)}</div>
    <div style="margin-top:12px">${cartaoNumero("Ticket médio", brl(d.ticketMedio), "Faturamento por atendimento concluído")}</div>

    <section class="card" style="margin-top:14px">
      <h2 class="sub-label" style="margin:0 0 12px">Serviços mais contratados</h2>
      <div id="bloco-ranking" style="position:relative;height:${Math.max(140, ranking.length * 46 + 30)}px">
        <canvas id="grafico-ranking" role="img" aria-label="Gráfico de barras dos serviços mais contratados"></canvas>
      </div>
      ${lista}
      <p class="hint">Não conta os agendamentos cancelados.</p>
    </section>

    <section class="card" style="margin-top:14px">
      <h2 class="sub-label" style="margin:0 0 12px">Situação da agenda</h2>
      <div id="bloco-status" style="position:relative;height:240px">
        <canvas id="grafico-status" role="img" aria-label="Gráfico da situação dos agendamentos no período"></canvas>
      </div>
    </section>`;
}

function desenhar() {
  graficos.forEach((g) => g.destroy());
  graficos = [];

  const chips = PERIODOS.map((p) => `
    <button type="button" class="btn ${s.chave === p.chave ? "btn-primary" : "btn-outline"}" data-periodo="${p.chave}"
            style="width:auto;padding:10px 16px;font-size:15px">${esc(p.rotulo)}</button>`).join("");

  const personalizado = s.chave === "custom" ? `
    <div style="display:flex;gap:12px;margin-top:14px;flex-wrap:wrap">
      <label style="flex:1;min-width:140px;font-weight:600;font-size:14px">De
        <div class="input-wrap"><input type="date" id="data-inicio" value="${esc(s.inicio)}"></div>
      </label>
      <label style="flex:1;min-width:140px;font-weight:600;font-size:14px">Até
        <div class="input-wrap"><input type="date" id="data-fim" value="${esc(s.fim)}"></div>
      </label>
    </div>
    <button type="button" class="btn btn-primary" id="aplicar" style="margin-top:12px">Aplicar período</button>` : "";

  const direita = menuProfissional("painel");

  pintar(ctx.raiz, `
    ${cabecalho(direita)}
    <main>
      <h1 class="title">Painel executivo</h1>
      <p class="lead">${esc(dataBR(s.inicio))} a ${esc(dataBR(s.fim))}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">${chips}</div>
      ${personalizado}
      ${conteudo()}
    </main>`);
  ligar();
  if (!s.carregando && !s.erro && s.dados) montarGraficos();
}

async function montarGraficos() {
  const dados = s.dados;
  const total = Object.values(dados.statusDaAgenda).reduce((a, b) => a + b, 0);
  if (!total) return;

  let Chart;
  try {
    Chart = await carregarChart();
  } catch {
    if (!ctx.ativa() || s.dados !== dados) return;
    ["bloco-ranking", "bloco-status"].forEach((id) => {
      const bloco = $(`#${id}`, ctx.raiz);
      if (bloco) bloco.innerHTML = `<p class="hint erro">Não foi possível carregar os gráficos. Os números acima continuam valendo.</p>`;
    });
    return;
  }
  if (!ctx.ativa() || s.dados !== dados) return;

  const violeta = cor("--violet", "#5B21B6");
  const verde = cor("--green", "#15803D");
  const ambar = cor("--amber", "#B45309");
  const rosa = cor("--rose", "#BE185D");
  const texto = cor("--ink", "#241C3D");
  const suave = cor("--line", "#E7E1F2");
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.color = texto;

  const ranking = dados.servicosMaisContratados.slice(0, 6);
  const canvasRanking = $("#grafico-ranking", ctx.raiz);
  if (canvasRanking && ranking.length) {
    graficos.push(new Chart(canvasRanking, {
      type: "bar",
      data: {
        labels: ranking.map((r) => r.nome),
        datasets: [{ data: ranking.map((r) => r.quantidade), backgroundColor: violeta, borderRadius: 8, maxBarThickness: 28 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: suave } },
          y: { grid: { display: false } },
        },
      },
    }));
  }

  const st = dados.statusDaAgenda;
  const canvasStatus = $("#grafico-status", ctx.raiz);
  if (canvasStatus) {
    graficos.push(new Chart(canvasStatus, {
      type: "doughnut",
      data: {
        labels: ["Concluídos", "Confirmados", "Cancelados"],
        datasets: [{
          data: [st.concluido, st.confirmado, st.cancelado],
          backgroundColor: [verde, violeta, rosa],
          borderWidth: 2,
          borderColor: "#fff",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 14 } } },
      },
    }));
  }
}

// ---------- Eventos ----------
function ligar() {
  const raiz = ctx.raiz;
  $("#sair", raiz).onclick = () => { sair(); irPara("/login"); };

  raiz.querySelectorAll("[data-periodo]").forEach((b) => {
    b.onclick = () => escolherPeriodo(b.dataset.periodo);
  });

  const aplicar = $("#aplicar", raiz);
  if (aplicar) {
    aplicar.onclick = () => {
      const inicio = $("#data-inicio", raiz).value;
      const fim = $("#data-fim", raiz).value;
      if (!inicio || !fim) return toast("Escolha as duas datas.", "erro");
      if (inicio > fim) return toast("A data inicial não pode ser depois da final.", "erro");
      s.inicio = inicio;
      s.fim = fim;
      carregar();
    };
  }
  const tentar = $("#tentar", raiz);
  if (tentar) tentar.onclick = carregar;
}

function escolherPeriodo(chave) {
  s.chave = chave;
  if (chave === "custom") {
    desenhar();   // mostra os campos de data; busca só ao aplicar
    return;
  }
  const { inicio, fim } = intervalo(chave);
  s.inicio = inicio;
  s.fim = fim;
  carregar();
}

// ---------- Dados ----------
async function carregar() {
  const sessao = sessaoAtual();
  if (!sessao) {
    sair();
    return irPara("/login");
  }
  const { inicio, fim } = s;
  s.carregando = true;
  s.erro = "";
  desenhar();
  try {
    const dados = await api.admin.dashboard(inicio, fim, sessao.token);
    if (!ctx.ativa() || s.inicio !== inicio || s.fim !== fim) return;
    s.dados = dados;
  } catch (erro) {
    if (!ctx.ativa()) return;
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

// ---------- Entrada da tela ----------
export async function renderizar(contexto) {
  ctx = contexto;
  if (!sessaoAtual()) return irPara("/login");
  s = { chave: "mes", inicio: "", fim: "", dados: null, carregando: true, erro: "" };
  Object.assign(s, intervalo("mes"));
  await carregar();
}
