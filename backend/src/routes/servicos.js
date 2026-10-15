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

  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

module.exports = router;
