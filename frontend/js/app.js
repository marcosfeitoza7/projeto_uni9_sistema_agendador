import { pintar, cabecalho } from "./ui.js";

const raiz = document.getElementById("app");

// Dados compartilhados entre as telas (somem ao recarregar a página)
export const estado = {
  rascunho: { servico: null, data: null, hora: null, nome: "", telefone: "" },
  ultimoAgendamento: null,
};

// Rota -> arquivo da tela (só é carregado quando a pessoa abre a tela)
const rotas = {
  "/": "./telas/home.js",
  "/agendar": "./telas/agendar.js",
  "/confirmado": "./telas/confirmado.js",
  "/consultar": "./telas/consultar.js",
  "/login": "./telas/login.js",
  "/agenda": "./telas/agenda.js",
  "/painel": "./telas/painel.js",
};

export const irPara = (caminho) => { location.hash = `#${caminho}`; };

function telaMensagem(titulo, texto) {
  return `
    ${cabecalho()}
    <main>
      <div class="card center">
        <h1 class="title" style="font-size:26px">${titulo}</h1>
        <p class="lead">${texto}</p>
        <a class="btn btn-outline" href="#/" style="margin-top:22px">Voltar ao início</a>
      </div>
    </main>`;
}

let versaoAtual = 0;

async function mostrar() {
  const caminho = location.hash.replace(/^#/, "") || "/";
  const arquivo = rotas[caminho];
  const versao = ++versaoAtual;
  window.scrollTo(0, 0);

  if (!arquivo) {
    pintar(raiz, telaMensagem("Página não encontrada", "Esse endereço não existe no sistema."));
    return;
  }

  let modulo;
  try {
    modulo = await import(arquivo);
  } catch (erro) {
    console.error(`Tela ${caminho} indisponível:`, erro);
    pintar(raiz, telaMensagem("Tela em construção", "Esta parte do sistema ainda está sendo desenvolvida."));
    return;
  }

  try {
    // "ativa" diz se a pessoa ainda está nesta tela (evita pintar por cima de outra)
    await modulo.renderizar({ raiz, ativa: () => versao === versaoAtual });
  } catch (erro) {
    console.error(erro);
    if (versao === versaoAtual) {
      pintar(raiz, telaMensagem("Algo deu errado", "Recarregue a página e tente novamente."));
    }
  }
}

window.addEventListener("hashchange", mostrar);
mostrar();
