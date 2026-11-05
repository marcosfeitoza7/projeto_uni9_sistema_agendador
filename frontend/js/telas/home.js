import { cabecalho, icone, pintar } from "../ui.js";

export function renderizar({ raiz }) {
  pintar(raiz, `
    ${cabecalho(`<span class="deco-icon" aria-hidden="true">${icone("sparkles", 28)}</span>`)}
    <main>
      <div class="hero">
        <p class="eyebrow">Seu tempo, seu cuidado</p>
        <h1 class="title">Agende com facilidade, gerencie com clareza.</h1>
        <p class="lead">Um espaço para cuidar do seu olhar. Como você deseja continuar?</p>
      </div>

      <div class="stack">
        <a class="choice is-primary" href="#/agendar">
          <span class="choice-head">
            <span class="choice-icon">${icone("sparkles", 26)}</span>
            <span class="choice-title">Sou cliente</span>
          </span>
          <span class="choice-text">Escolha seu serviço, marque um horário e consulte ou cancele quando precisar.</span>
          <span class="choice-cta">Agendar horário ${icone("arrow-right", 22)}</span>
        </a>

        <a class="choice" href="#/login">
          <span class="choice-head">
            <span class="choice-icon">${icone("briefcase", 26)}</span>
            <span class="choice-title">Sou a lash designer</span>
          </span>
          <span class="choice-text">Veja sua agenda e acompanhe o faturamento do seu studio.</span>
          <span class="choice-cta">Entrar no painel ${icone("arrow-right", 22)}</span>
        </a>
      </div>

      <a class="btn-link center-link" href="#/consultar">${icone("search", 20)} Consultar agendamento</a>
    </main>`);
}
