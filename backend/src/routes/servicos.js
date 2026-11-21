const express = require("express");
const supabase = require("../supabaseClient");

const router = express.Router();

// GET /api/servicos: catálogo de serviços ativos (tela de agendamento)
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("servicos")
    .select("*")
    .eq("ativo", true)
    .order("preco", { ascending: false });

  if (error) { console.error(error.message); return res.status(500).json({ erro: "Erro interno no servidor." }); }
  res.json(data);
});

module.exports = router;
