require("dotenv").config();
const express = require("express");
const cors = require("cors");

const supabase = require("./src/supabaseClient");
const servicosRouter = require("./src/routes/servicos");
const agendamentosRouter = require("./src/routes/agendamentos");
const adminRouter = require("./src/routes/admin");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// Rotas públicas (área do cliente, sem login)
app.use("/api/servicos", servicosRouter);
app.use("/api/agendamentos", agendamentosRouter);

// Rotas protegidas (área da lash designer, com login)
app.use("/api/admin", adminRouter);

// Rota de saúde. Também funciona como ping de keep-alive: o monitor
// (UptimeRobot) chama essa rota a cada poucos minutos. Além de manter
// o back-end acordado, a consulta abaixo gera atividade real no banco,
// evitando que o Supabase pause o projeto por inatividade.
app.get("/api/health", async (req, res) => {
  try {
    const { count, error } = await supabase
      .from("servicos")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    res.json({ status: "ok", servicosCadastrados: count });
  } catch (err) {
    res.status(500).json({ status: "erro", detalhe: err.message });
  }
});

// Tratamento de erros não previstos
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno no servidor." });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`API do Lash Studio rodando na porta ${PORT}`);
});
