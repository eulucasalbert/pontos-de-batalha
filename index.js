const { WebcastPushConnection } = require('tiktok-live-connector');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const app = express();

// Railway exige que a porta venha da variável de ambiente
const PORT = process.env.PORT || 8080;

// -----------------------
// Config do Supabase (se você for usar depois)
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const supabase = SUPABASE_URL
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
// -----------------------

app.use(express.json());

// Rota raiz (o que você já viu no navegador)
app.get('/', (req, res) => {
  res.send('Servidor rodando no Railway 🚀');
});

// Exemplo de endpoint de teste
app.get('/status', (req, res) => {
  res.json({
    status: "online",
    time: new Date().toISOString()
  });
});

// Exemplo de endpoint para conectar no TikTok Live
app.post('/connect', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Envie o username do TikTok" });
  }

  try {
    const tiktokLive = new WebcastPushConnection(username);

    tiktokLive.connect()
      .then(() => {
        console.log(`Conectado na live de ${username}`);
      })
      .catch(err => {
        console.error(err);
      });

    //
