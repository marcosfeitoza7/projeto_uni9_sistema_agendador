import { estado, irPara } from "../app.js";
import { esc, brl, dataHora, icone, pintar, cabecalho, toast } from "../ui.js";

export function renderizar({ raiz }) {
  // Se a página foi recarregada, o código continua guardado na sessão do navegador
  let ag = estado.ultimoAgendamento;
  if (!ag) {
    try { ag = JSON.parse(sessionStorage.getItem("ultimoAgendamento")); } catch { ag = null; }
  }
  if (!ag) { irPara("/"); return; }

  const primeiroNome = String(ag.nomeCliente || "").trim().split(/\s+/)[0] || "";
  const servico = ag.servicos || {};
  const saudacao = primeiroNome ? `${esc(primeiroNome)}, seu` : "Seu";

  pintar(raiz, `
    ${cabecalho(`<a class="icon-btn" href="#/" aria-label="Voltar ao início">${icone("arrow-left", 20)}</a>`)}
    <main>
      <div class="badge-ok">${icone("check", 38)}</div>
      <h1 class="title">Agendamento confirmado!</h1>
      <p class="lead">${saudacao} horário está reservado. Esperamos você no Lash Studio.</p>

      <div class="card confirm-card">
        <p class="confirm-nome">${esc(ag.nomeCliente)}</p>
        <p class="confirm-servico">${esc(servico.nome)}</p>
        <div class="confirm-linha">
          <span>${icone("calendar-check", 20)} ${esc(dataHora(ag.data, ag.hora))}</span>
          <span class="preco">${brl(servico.preco)}</span>
        </div>
      </div>

      <div class="code-card">
        <p class="eyebrow">Seu código de confirmação</p>
        <div class="code-row">
          <span class="code" id="codigo">${esc(ag.codigo_confirmacao)}</span>
          <button type="button" class="copy-btn" id="copiar" aria-label="Copiar código">${icone("copy", 26)}</button>
        </div>
        <p class="code-hint">Guarde este código com seu telefone, e use-o em Consultar agendamento para editar ou cancelar.</p>
      </div>

      <div class="stack-sm">
        <a class="btn btn-primary" href="#/consultar">Consultar agendamento ${icone("arrow-right", 22)}</a>
        <a class="btn btn-outline" href="#/agendar">Fazer novo agendamento</a>
      </div>
    </main>`);

  document.getElementById("copiar").onclick = async () => {
    try {
      await navigator.clipboard.writeText(ag.codigo_confirmacao);
      toast("Código copiado");
    } catch {
      toast(`Seu código: ${ag.codigo_confirmacao}`);
    }
  };
}
