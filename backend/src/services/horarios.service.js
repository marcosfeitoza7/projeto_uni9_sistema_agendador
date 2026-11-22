const supabase = require("../supabaseClient");
const R = require("../regras");

// Funcionamento do studio, editado pela profissional:
//  - excecao_data: uma data específica (folga, meio período ou dia extra). Tem prioridade.
//  - horario_semanal: o horário de cada dia da semana.
// Se nada estiver cadastrado para o dia, o studio é tratado como fechado.

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const paraExpediente = (linha) =>
  linha && linha.aberto ? { abre: hhmm(linha.abre), fecha: hhmm(linha.fecha) } : null;

// Devolve { abre: "09:00", fecha: "18:00" } ou null (fechado) para uma data YYYY-MM-DD
async function expedienteDaData(data) {
  const { data: excecao, error } = await supabase
    .from("excecao_data")
    .select("aberto, abre, fecha")
    .eq("data", data)
    .maybeSingle();
  if (error) throw error;
  if (excecao) return paraExpediente(excecao);

  const { data: semana, error: erroSemana } = await supabase
    .from("horario_semanal")
    .select("aberto, abre, fecha")
    .eq("dia_semana", R.diaDaSemana(data))
    .maybeSingle();
  if (erroSemana) throw erroSemana;
  return paraExpediente(semana);
}

module.exports = { expedienteDaData };
