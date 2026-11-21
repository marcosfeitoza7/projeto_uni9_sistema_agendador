import { irPara } from "../app.js";
import { $, esc, icone, pintar, cabecalho, botaoVoltar, toast } from "../ui.js";
import { entrar, pedirCodigo, redefinirSenha, sessaoAtual } from "../sessao.js";

let ctx;
let etapa = "entrar";   // "entrar" | "pedir" | "codigo"
let email = "";
let erro = "";
let ocupado = false;

const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function campoSenha(id, rotulo, autocomplete) {
  return `
    <div class="field">
      <label for="${id}">${rotulo}</label>
      <div class="input-wrap">
        <input id="${id}" type="password" autocomplete="${autocomplete}" maxlength="72">
        <button type="button" class="ico-end ver-senha" style="background:none;border:0;cursor:pointer;padding:4px" data-alvo="${id}" aria-label="Mostrar ou ocultar a senha">${icone("eye", 22)}</button>
      </div>
    </div>`;
}

const mensagemErro = () => (erro ? `<p class="hint erro" role="alert">${esc(erro)}</p>` : "");

function telaEntrar() {
  return `
    <h1 class="title">Área da profissional</h1>
    <p class="lead">Entre para ver a agenda do dia e os números do seu estúdio.</p>
    <form id="form" class="consulta-form" novalidate>
      <div class="field">
        <label for="email">E-mail</label>
        <div class="input-wrap">
          <input id="email" type="email" autocomplete="username" inputmode="email" maxlength="120" value="${esc(email)}">
        </div>
      </div>
      ${campoSenha("senha", "Senha", "current-password")}
      <button type="submit" class="btn btn-primary" ${ocupado ? "disabled" : ""}>${ocupado ? "Entrando..." : "Entrar"}</button>
      ${mensagemErro()}
      <button type="button" class="link-sm" id="esqueci" style="margin-top:18px">Esqueci minha senha</button>
    </form>`;
}

function telaPedir() {
  return `
    <h1 class="title">Recuperar senha</h1>
    <p class="lead">Informe o e-mail da sua conta. Vamos enviar um código para você trocar a senha.</p>
    <form id="form" class="consulta-form" novalidate>
      <div class="field">
        <label for="email">E-mail</label>
        <div class="input-wrap">
          <input id="email" type="email" autocomplete="username" inputmode="email" maxlength="120" value="${esc(email)}">
        </div>
      </div>
      <button type="submit" class="btn btn-primary" ${ocupado ? "disabled" : ""}>${ocupado ? "Enviando..." : "Enviar código"}</button>
      ${mensagemErro()}
      <button type="button" class="link-sm" id="voltar-entrar" style="margin-top:18px">Voltar para o login</button>
    </form>`;
}

function telaCodigo() {
  return `
    <h1 class="title">Nova senha</h1>
    <p class="lead">Se o e-mail <b>${esc(email)}</b> tiver cadastro, você receberá um código em instantes. Digite o código e escolha a nova senha.</p>
    <form id="form" class="consulta-form" novalidate>
      <div class="field">
        <label for="codigo">Código recebido por e-mail</label>
        <div class="input-wrap">
          <input id="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="000000">
        </div>
      </div>
      ${campoSenha("nova", "Nova senha", "new-password")}
      ${campoSenha("nova2", "Repita a nova senha", "new-password")}
      <p class="hint">Use pelo menos 8 caracteres.</p>
      <button type="submit" class="btn btn-primary" style="margin-top:16px" ${ocupado ? "disabled" : ""}>${ocupado ? "Salvando..." : "Trocar senha"}</button>
      ${mensagemErro()}
      <button type="button" class="link-sm" id="reenviar" style="margin-top:18px">Não chegou? Enviar outro código</button>
    </form>`;
}

function desenhar() {
  const corpo = { entrar: telaEntrar, pedir: telaPedir, codigo: telaCodigo }[etapa]();
  pintar(ctx.raiz, `${cabecalho(botaoVoltar("#/"))}<main>${corpo}</main>`);
  ligar();
}

function ir(novaEtapa) {
  etapa = novaEtapa;
  erro = "";
  ocupado = false;
  desenhar();
}

function ligar() {
  const raiz = ctx.raiz;
  const campoEmail = $("#email", raiz);
  if (campoEmail) campoEmail.oninput = () => { email = campoEmail.value.trim(); };

  raiz.querySelectorAll(".ver-senha").forEach((b) => {
    b.onclick = () => {
      const campo = $(`#${b.dataset.alvo}`, raiz);
      campo.type = campo.type === "password" ? "text" : "password";
    };
  });

  const clique = (id, fn) => { const el = $(id, raiz); if (el) el.onclick = fn; };
  clique("#esqueci", () => ir("pedir"));
  clique("#voltar-entrar", () => ir("entrar"));
  clique("#reenviar", () => ir("pedir"));

  $("#form", raiz).onsubmit = (ev) => {
    ev.preventDefault();
    if (ocupado) return;
    ({ entrar: enviarLogin, pedir: enviarPedido, codigo: enviarNovaSenha })[etapa]();
  };
}

async function executar(tarefa) {
  ocupado = true;
  erro = "";
  desenhar();
  try {
    await tarefa();
  } catch (e) {
    if (!ctx.ativa()) return;
    erro = e.message;
  }
  ocupado = false;
  if (ctx.ativa()) desenhar();
}

function enviarLogin() {
  const senha = $("#senha", ctx.raiz).value;
  if (!emailValido(email) || !senha) {
    erro = "Informe o e-mail e a senha.";
    return desenhar();
  }
  return executar(async () => {
    await entrar(email, senha);
    if (ctx.ativa()) irPara("/agenda");
  });
}

function enviarPedido() {
  if (!emailValido(email)) {
    erro = "Informe um e-mail válido.";
    return desenhar();
  }
  return executar(async () => {
    await pedirCodigo(email);
    if (ctx.ativa()) { etapa = "codigo"; toast("Se o e-mail estiver cadastrado, o código foi enviado"); }
  });
}

function enviarNovaSenha() {
  const codigo = $("#codigo", ctx.raiz).value.replace(/\D/g, "");
  const nova = $("#nova", ctx.raiz).value;
  const repetida = $("#nova2", ctx.raiz).value;
  if (codigo.length < 6) { erro = "Digite o código recebido por e-mail."; return desenhar(); }
  if (nova.length < 8) { erro = "A nova senha precisa ter pelo menos 8 caracteres."; return desenhar(); }
  if (nova !== repetida) { erro = "As duas senhas não são iguais."; return desenhar(); }
  return executar(async () => {
    await redefinirSenha(email, codigo, nova);
    if (!ctx.ativa()) return;
    etapa = "entrar";
    toast("Senha alterada. Entre com a nova senha.");
  });
}

export function renderizar(contexto) {
  ctx = contexto;
  if (sessaoAtual()) return irPara("/agenda");   // já está logada
  etapa = "entrar";
  email = "";
  erro = "";
  ocupado = false;
  desenhar();
}
