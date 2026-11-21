import { api } from "../api.js";
import { estado, irPara } from "../app.js";
import {
  $, esc, brl, duracao, hhmm, hojeISO, limiteAgendamento, avisoHorarios, rotuloData, dataHora,
  soDigitos, mascaraTelefone, icone, pintar, cabecalho, carregando, toast,
} from "../ui.js";

let ctx;              // { raiz, ativa } da tela atual
let passo = 1;        // 1 = serviço, 2 = data e horário, 3 = seus dados
let servicos = null;  // lista vinda da API (guardada para não buscar de novo)

const ROTULOS = ["Escolha o serviço", "Escolha data e horário", "Seus dados"];

// ---------- Peças comuns ----------
const botaoVoltar = () =>
  `<button type="button" class="icon-btn" data-voltar aria-label="Voltar">${icone("arrow-left", 20)}</button>`;

function progresso(n) {
  const barras = [1, 2, 3].map((i) => `<span class="${i <= n ? "on" : ""}"></span>`).join("");
  return `
    <div class="steps" aria-hidden="true">${barras}</div>
    <div class="steps-label"><span class="steps-nome">${ROTULOS[n - 1]}</span><span>${n} de 3</span></div>`;
}

function moldura(n, conteudo) {
  pintar(ctx.raiz, `${cabecalho(botaoVoltar())}<main>${progresso(n)}${conteudo}</main>`);
  $("[data-voltar]", ctx.raiz).onclick = () => (passo === 1 ? irPara("/") : irAoPasso(passo - 1));
}

function mostrarErro(mensagem, tentarDeNovo) {
  moldura(passo, `
    <div class="card center">
      <p>${esc(mensagem)}</p>
      <button type="button" class="btn btn-outline" id="tentar" style="margin-top:18px">Tentar novamente</button>
    </div>`);
  $("#tentar", ctx.raiz).onclick = tentarDeNovo;
}

function irAoPasso(n) {
  passo = n;
  window.scrollTo(0, 0);
  [passoServico, passoHorario, passoDados][n - 1]();
}

// ---------- Passo 1: serviço ----------
async function passoServico() {
  if (!servicos) {
    moldura(1, carregando("Carregando serviços..."));
    try {
      servicos = await api.servicos();
    } catch (erro) {
      if (ctx.ativa()) mostrarErro(erro.message, passoServico);
      return;
    }
    if (!ctx.ativa()) return;
  }
  desenharServicos();
}

function desenharServicos() {
  const r = estado.rascunho;
  if (r.servico) r.servico = servicos.find((s) => s.id === r.servico.id) || null;

  const lista = servicos.length
    ? servicos.map((s) => {
        const sel = r.servico?.id === s.id;
        return `
          <button type="button" class="opt ${sel ? "is-selected" : ""}" data-id="${esc(s.id)}" aria-pressed="${sel}">
            <span class="opt-name">${esc(s.nome)}</span>
            <span class="radio">${sel ? icone("check", 18) : ""}</span>
            ${s.descricao ? `<span class="opt-desc">${esc(s.descricao)}</span>` : ""}
            <span class="opt-meta">
              <span class="opt-price">${brl(s.preco)}</span>
              <span class="opt-time">${icone("clock", 18)} ${duracao(s.duracao_minutos)}</span>
            </span>
          </button>`;
      }).join("")
    : `<div class="card center">Nenhum serviço disponível no momento.</div>`;

  moldura(1, `
    <div class="hero">
      <h1 class="title">Agende seu horário</h1>
      <p class="lead">Escolha o serviço, o horário e confirme seus dados, sem necessidade de senha.</p>
    </div>
    <div class="stack">${lista}</div>
    <div class="footer-actions">
      <button type="button" class="btn btn-primary" id="continuar" ${r.servico ? "" : "disabled"}>
        Continuar ${icone("arrow-right", 22)}
      </button>
      <p class="footnote">Sem cadastro. Sem necessidade de senha.</p>
    </div>`);

  ctx.raiz.querySelectorAll("[data-id]").forEach((el) => {
    el.onclick = () => {
      r.servico = servicos.find((s) => s.id === el.dataset.id);
      desenharServicos();
    };
  });
  $("#continuar", ctx.raiz).onclick = () => irAoPasso(2);
}

// ---------- Passo 2: data e horário ----------
async function passoHorario() {
  const r = estado.rascunho;
  if (!r.servico) return irAoPasso(1);
  if (!r.data || r.data < hojeISO()) r.data = hojeISO();
  if (r.data > limiteAgendamento(hojeISO())) r.data = limiteAgendamento(hojeISO());

  const dataPedida = r.data;
  desenharHorarios({ buscando: true });
  try {
    const horarios = await api.horarios(dataPedida, r.servico.id);
    if (!ctx.ativa() || passo !== 2 || r.data !== dataPedida) return;
    desenharHorarios({ horarios });
  } catch (erro) {
    if (!ctx.ativa() || passo !== 2 || r.data !== dataPedida) return;
    desenharHorarios({ erro: erro.message });
  }
}

function desenharHorarios({ buscando, horarios, erro }) {
  const r = estado.rascunho;
  const hoje = hojeISO();

  let area;
  if (buscando) {
    area = carregando("Carregando horários...");
  } else if (erro) {
    area = `
      <div class="card center">
        <p>${esc(erro)}</p>
        <button type="button" class="btn btn-outline" id="tentar" style="margin-top:14px">Tentar novamente</button>
      </div>`;
  } else {
    const lista = horarios.map((h) => {
      const hora = hhmm(h.hora);
      return { hora, livre: h.disponivel };
    });
    if (r.hora && !lista.some((h) => h.hora === r.hora && h.livre)) r.hora = null;
    area = `
      <div class="slots" role="group" aria-label="Horários">
        ${lista.map((h) => `
          <button type="button" class="slot ${r.hora === h.hora ? "is-selected" : ""}"
                  data-hora="${h.hora}" ${h.livre ? "" : "disabled"}>${h.hora}</button>`).join("")}
      </div>
      <div class="legend">
        <span><i class="sq livre"></i>Disponível</span>
        <span><i class="sq sel"></i>Selecionado</span>
        <span><i class="sq ocup"></i>Indisponível</span>
      </div>
      ${avisoHorarios(horarios) ? `<p class="hint">${esc(avisoHorarios(horarios))}</p>` : ""}`;
  }

  moldura(2, `
    <div class="hero">
      <h1 class="title">Um momento para você.</h1>
      <p class="lead">Escolha data e horário para o seu atendimento.</p>
    </div>
    <div class="picked-line">
      <span>${esc(r.servico.nome)} · ${brl(r.servico.preco)}</span>
      <button type="button" class="link-sm" id="alterar">Alterar</button>
    </div>
    <div class="date-wrap">
      <button type="button" class="date-row" id="data-btn">
        ${icone("calendar-days", 24)}<span class="grow">${esc(rotuloData(r.data))}</span>${icone("chevron-down", 22)}
      </button>
      <input type="date" id="data-input" class="sr-only" tabindex="-1" aria-label="Escolher outra data"
             value="${r.data}" min="${hoje}" max="${limiteAgendamento(hoje)}">
    </div>
    <p class="sub-label">Horários de ${esc(rotuloData(r.data).toLowerCase())}</p>
    ${area}
    <div class="footer-actions">
      ${r.hora ? `
        <div class="pick-card">
          ${icone("calendar-check", 26)}
          <div>
            <p class="pick-title">${esc(dataHora(r.data, r.hora))}</p>
            <p class="pick-sub">${esc(r.servico.nome)} · ${duracao(r.servico.duracao_minutos)}</p>
          </div>
        </div>` : ""}
      <button type="button" class="btn btn-primary" id="continuar" ${r.hora ? "" : "disabled"}>
        Continuar ${icone("arrow-right", 22)}
      </button>
    </div>`);

  $("#alterar", ctx.raiz).onclick = () => irAoPasso(1);

  const entradaData = $("#data-input", ctx.raiz);
  $("#data-btn", ctx.raiz).onclick = () => {
    try { entradaData.showPicker(); } catch { entradaData.focus(); entradaData.click(); }
  };
  entradaData.onchange = () => {
    if (!entradaData.value) return;
    r.data = entradaData.value;
    r.hora = null;
    passoHorario();
  };

  ctx.raiz.querySelectorAll("[data-hora]").forEach((el) => {
    el.onclick = () => { r.hora = el.dataset.hora; desenharHorarios({ horarios }); };
  });
  const continuar = $("#continuar", ctx.raiz);
  continuar.onclick = () => irAoPasso(3);
  const tentar = $("#tentar", ctx.raiz);
  if (tentar) tentar.onclick = passoHorario;
}

// ---------- Passo 3: seus dados ----------
function passoDados() {
  const r = estado.rascunho;
  if (!r.servico) return irAoPasso(1);
  if (!r.hora) return irAoPasso(2);

  moldura(3, `
    <div class="hero">
      <h1 class="title">Falta só um detalhe.</h1>
      <p class="lead">Confirme seus dados para reservar este momento de cuidado.</p>
    </div>

    <div class="field">
      <label for="nome">Nome completo</label>
      <div class="input-wrap">
        <input id="nome" type="text" autocomplete="name" maxlength="80" placeholder="Ex.: Ana Costa" value="${esc(r.nome)}">
      </div>
      <p class="hint">Como podemos te chamar?</p>
    </div>

    <div class="field">
      <label for="telefone">Telefone (WhatsApp)</label>
      <div class="input-wrap">
        <input id="telefone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="15"
               placeholder="(11) 90000-0000" value="${esc(r.telefone)}">
        <span class="ico-end">${icone("phone", 22)}</span>
      </div>
      <p class="hint" id="dica-telefone">Exemplo: (11) 90000-0000</p>
    </div>

    <div class="card">
      <p class="eyebrow" style="margin-bottom:0;font-size:11.5px">Resumo do agendamento</p>
      <p class="resumo-titulo">${esc(r.servico.nome)}</p>
      <div class="linha"><span>Quando</span><b>${esc(dataHora(r.data, r.hora))}</b></div>
      <div class="linha"><span>Duração</span><b>${duracao(r.servico.duracao_minutos)}</b></div>
      <div class="divisor"></div>
      <div class="linha"><span>Valor total</span><b>${brl(r.servico.preco)}</b></div>
    </div>

    <div class="footer-actions">
      <button type="button" class="btn btn-primary" id="confirmar">Confirmar agendamento — ${brl(r.servico.preco)}</button>
      <p class="secure-note">${icone("lock", 16)} Seus dados são usados para o agendamento. Cancelamentos e trocas podem ser feitos até 4 horas antes.</p>
    </div>`);

  const nome = $("#nome", ctx.raiz);
  const telefone = $("#telefone", ctx.raiz);
  const dica = $("#dica-telefone", ctx.raiz);
  const botao = $("#confirmar", ctx.raiz);
  const rotuloBotao = botao.innerHTML;

  const telefoneValido = () => [10, 11].includes(soDigitos(telefone.value).length);
  const formularioValido = () => nome.value.trim().length >= 2 && telefoneValido();
  const atualizar = () => { botao.disabled = !formularioValido(); };

  nome.oninput = () => { r.nome = nome.value; atualizar(); };
  telefone.oninput = () => {
    telefone.value = mascaraTelefone(telefone.value);
    r.telefone = telefone.value;
    dica.textContent = "Exemplo: (11) 90000-0000";
    dica.classList.remove("erro");
    atualizar();
  };
  telefone.onblur = () => {
    if (telefone.value && !telefoneValido()) {
      dica.textContent = "Informe o DDD e o número, com 10 ou 11 dígitos.";
      dica.classList.add("erro");
    }
  };
  atualizar();

  botao.onclick = async () => {
    if (!formularioValido()) return;
    botao.disabled = true;
    botao.textContent = "Confirmando...";

    try {
      const agendamento = await api.agendar({
        nome: nome.value.trim(),
        telefone: soDigitos(telefone.value),
        servico_id: r.servico.id,
        data: r.data,
        hora: r.hora,
      });

      const resultado = { ...agendamento, nomeCliente: nome.value.trim(), telefone: soDigitos(telefone.value) };
      estado.ultimoAgendamento = resultado;
      try { sessionStorage.setItem("ultimoAgendamento", JSON.stringify(resultado)); } catch { /* sem armazenamento */ }

      Object.assign(r, { servico: null, data: null, hora: null, nome: "", telefone: "" });
      if (ctx.ativa()) irPara("/confirmado");
    } catch (erro) {
      toast(erro.message, "erro");
      if (erro.status === 409) {
        r.hora = null;           // horário foi ocupado por outra pessoa
        if (ctx.ativa()) irAoPasso(2);
      } else if (ctx.ativa()) {
        botao.innerHTML = rotuloBotao;
        atualizar();
      }
    }
  };
}

// ---------- Entrada da tela ----------
export async function renderizar(contexto) {
  ctx = contexto;
  passo = 1;
  await passoServico();
}
