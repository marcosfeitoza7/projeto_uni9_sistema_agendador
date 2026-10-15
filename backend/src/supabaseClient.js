// Cliente único do Supabase, usado por toda a API.
// Usa a service role key porque o backend é o responsável por
// validar telefone + código (o banco não confia no front-end).

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env (veja .env.example)."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "lash_studio" },
  auth: { persistSession: false },
});

module.exports = supabase;
