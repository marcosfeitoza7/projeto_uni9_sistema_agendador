// Protege as rotas da lash designer (/api/admin/*).
// O front-end faz login no Supabase Auth e envia o access_token no header
// Authorization: Bearer <token>. Aqui a API pergunta ao Supabase se o token é válido
// e confere se o e-mail dono do token está na lista de profissionais autorizadas.

const supabase = require("../supabaseClient");

// E-mails autorizados, separados por vírgula, na variável PROFISSIONAL_EMAIL (no Render).
// Se a variável não existir, ninguém passa: é melhor travar do que liberar por engano.
const emailsAutorizados = () =>
  (process.env.PROFISSIONAL_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

async function exigirLogin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: "Token de acesso não informado." });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ erro: "Sessão inválida ou expirada. Faça login novamente." });
  }

  const email = String(data.user.email || "").toLowerCase();
  if (!emailsAutorizados().includes(email)) {
    return res.status(403).json({ erro: "Este usuário não tem acesso à área da profissional." });
  }

  req.usuario = data.user;
  next();
}

module.exports = { exigirLogin };
