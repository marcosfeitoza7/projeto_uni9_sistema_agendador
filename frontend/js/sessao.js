// Login da profissional, usando a API de autenticação do Supabase (sem biblioteca extra).
// A sessão fica só na aba aberta (sessionStorage): fechou a aba, saiu.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const CHAVE = "sessaoProfissional";

// Códigos de erro do Supabase -> mensagens em português
const MENSAGENS = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Este e-mail ainda não foi confirmado.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit: "Muitos pedidos de código. Aguarde alguns minutos e tente de novo.",
  otp_expired: "Código inválido ou expirado. Peça um novo código.",
  same_password: "A nova senha precisa ser diferente da senha atual.",
  weak_password: "Senha muito fraca. Use pelo menos 8 caracteres, misturando letras e números.",
};

async function chamarAuth(caminho, { metodo = "POST", corpo, token } = {}) {
  const cabecalhos = { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  let resposta;
  try {
    resposta = await fetch(`${SUPABASE_URL}/auth/v1${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error("Não foi possível conectar. Verifique sua internet e tente novamente.");
  }

  let dados = null;
  try { dados = await resposta.json(); } catch { /* sem corpo */ }

  if (!resposta.ok) {
    const codigo = dados?.error_code || dados?.code;
    throw new Error(MENSAGENS[codigo] || "Não foi possível concluir. Tente novamente.");
  }
  return dados;
}

function guardar(s) {
  const sessao = {
    token: s.access_token,
    expiraEm: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
  };
  try { sessionStorage.setItem(CHAVE, JSON.stringify(sessao)); } catch { /* sem armazenamento */ }
  return sessao;
}

// Sessão válida (ou null se não entrou ou se já expirou)
export function sessaoAtual() {
  try {
    const s = JSON.parse(sessionStorage.getItem(CHAVE));
    if (s?.token && s.expiraEm > Date.now() / 1000 + 10) return s;
  } catch { /* ignora */ }
  return null;
}

export function sair() {
  try { sessionStorage.removeItem(CHAVE); } catch { /* ignora */ }
}

export async function entrar(email, senha) {
  const dados = await chamarAuth("/token?grant_type=password", { corpo: { email, password: senha } });
  return guardar(dados);
}

// O Supabase envia um e-mail com o código. A resposta é a mesma exista o e-mail ou não.
export async function pedirCodigo(email) {
  await chamarAuth("/recover", { corpo: { email } });
}

// Confere o código do e-mail e já grava a nova senha. Não deixa a pessoa logada:
// depois de trocar, ela entra com a senha nova.
export async function redefinirSenha(email, codigo, novaSenha) {
  const dados = await chamarAuth("/verify", { corpo: { type: "recovery", email, token: codigo } });
  await chamarAuth("/user", { metodo: "PUT", corpo: { password: novaSenha }, token: dados.access_token });
  sair();
}
