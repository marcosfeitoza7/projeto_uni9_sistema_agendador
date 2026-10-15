// Protege as rotas da lash designer (/api/admin/*).
// O front-end faz login com supabase.auth.signInWithPassword() e envia
// o access_token no header Authorization: Bearer <token>.
// Aqui a API pergunta ao Supabase se esse token é válido.

const supabase = require("../supabaseClient");

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

  req.usuario = data.user;
  next();
}

module.exports = { exigirLogin };
