const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { WebcastPushConnection } = require("tiktok-live-connector");

const app = express();

// Railway exige usar a porta dinâmica
const PORT = process.env.PORT || 8080;

// Rota básica para testar se o servidor está vivo
app.get("/", (req, res) => {
  res.send("Servidor rodando no Railway 🚀");
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
