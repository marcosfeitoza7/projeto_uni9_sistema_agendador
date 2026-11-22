// Funções de apoio usadas por todas as telas.

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

// Protege contra HTML malicioso: use SEMPRE em textos digitados por clientes.
export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Formatação ----------
export const brl = (n) => {
  const v = Number(n);
  return `R$ ${v.toLocaleString("pt-BR", {
    minimumFractionDigits: v % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

export function duracao(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export const hhmm = (hora) => String(hora).slice(0, 5);

export const paraISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Sempre calculado no navegador (horário do Brasil), nunca no servidor.
export const hojeISO = () => paraISO(new Date());

export function somarDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  return paraISO(new Date(a, m - 1, d + n));
}

export function rotuloData(iso) {
  if (iso === hojeISO()) return "Hoje";
  if (iso === somarDias(hojeISO(), 1)) return "Amanhã";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d)
    .toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })
    .replace(/\./g, "");
}

export const dataHora = (iso, hora) => `${rotuloData(iso)}, às ${hhmm(hora)}`;

export const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

export function mascaraTelefone(valor) {
  const d = soDigitos(valor).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ---------- Ícones (Lucide) ----------
export const icone = (nome, tamanho = 22) =>
  `<i data-lucide="${nome}" width="${tamanho}" height="${tamanho}" aria-hidden="true"></i>`;

export function ativarIcones() {
  if (window.lucide) window.lucide.createIcons();
}

// Escreve o HTML na tela e transforma os ícones em SVG
export function pintar(raiz, html) {
  raiz.innerHTML = html;
  ativarIcones();
}

// ---------- Peças de tela ----------
export function cabecalho(direita = "") {
  return `
  <header class="topbar">
    <a class="brand" href="#/" aria-label="Lash Studio, início">
      <span class="brand-mark" aria-hidden="true">L</span>
      <span class="brand-text">
        <span class="brand-name">Lash Studio</span>
        <span class="brand-tag">Agendamento online</span>
      </span>
    </a>
    ${direita}
  </header>`;
}

export const botaoVoltar = (destino) =>
  `<a class="icon-btn" href="${destino}" aria-label="Voltar">${icone("arrow-left", 20)}</a>`;

export const carregando = (mensagem = "Carregando...") => `
  <div class="loading">
    <div class="spinner" aria-hidden="true"></div>
    <p>${esc(mensagem)}</p>
    <p class="loading-note">Na primeira visita do dia, o servidor gratuito pode levar até 1 minuto para acordar.</p>
  </div>`;

let temporizadorToast;
export function toast(mensagem, tipo = "") {
  const el = $("#toast");
  el.textContent = mensagem;
  el.className = `toast show ${tipo}`;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { el.className = "toast"; }, 3200);
}

// Última data em que dá para agendar: o mesmo dia do mês seguinte, menos 1 dia
// (hoje 21/11 libera até 20/12). Mesma regra do back-end, usada só para limitar o calendário.
export function limiteAgendamento(hoje) {
  const [a, m, d] = hoje.split("-").map(Number);
  const ultimoDiaDoMesSeguinte = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDiaDoMesSeguinte);
  return new Date(Date.UTC(a, m, dia - 1)).toISOString().slice(0, 10);
}

// Explica ao cliente por que alguns horários não podem ser escolhidos.
// "horarios" vem da API: [{ hora, disponivel, motivo }]
export function avisoHorarios(horarios) {
  if (!horarios.length) return "O studio não atende neste dia. Escolha outra data.";
  const motivos = new Set(horarios.filter((h) => !h.disponivel).map((h) => h.motivo));
  if (!horarios.some((h) => h.disponivel)) {
    if (motivos.has("FECHADO")) return "O studio não atende neste dia. Escolha outra data.";
    if (motivos.has("FORA_DA_JANELA")) return "Esta data ainda não está aberta para agendamento. Escolha uma data mais próxima.";
    if (motivos.has("ANTECEDENCIA")) return "Não há mais horários neste dia: é preciso agendar com pelo menos 2 horas de antecedência.";
    return "Não há horários livres neste dia. Escolha outra data.";
  }
  if (motivos.has("ANTECEDENCIA")) return "Horários nas próximas 2 horas não podem ser reservados.";
  return "";
}
