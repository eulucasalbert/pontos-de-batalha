const { WebcastPushConnection } = require('tiktok-live-connector');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const app = express();

// 🚀 Railway exige porta dinâmica
const PORT = process.env.PORT || 8080;

// -----------------------
// CONFIG SUPABASE (opcional por enquanto)
// Só funciona se você colocar as variáveis no Railway → Variables
// SUPABASE_URL
// SUPABASE_KEY
// -----------------------
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

const supabase = SUPABASE_URL
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
// -----------------------

app.use(express.json());

// =======================
// 🔹 ROTAS HTTP
// =======================

// Rota raiz (o que aparece no navegador)
app.get('/', (req, res) => {
  res.send('Servidor rodando no Railway 🚀');
});

// Status rápido para checagem
app.get('/status', (req, res) => {
  res.json({
    status: "online",
    time: new Date().toISOString()
  });
});

// =======================
// 🔹 CONEXÃO COM TIKTOK LIVE
// =======================
let currentConnection = null;

app.post('/connect', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Envie o username do TikTok" });
  }

  try {
    // Se já existe conexão, fecha antes
    if (currentConnection) {
      console.log("Fechando conexão anterior...");
      currentConnection.disconnect();
    }

    const tiktokLive = new WebcastPushConnection(username);

    currentConnection = tiktokLive;

    await tiktokLive.connect();
    console.log(`✅ Conectado na live de ${username}`);

    // =======================
    // ESCUTAR LIKES
    // =======================
    tiktokLive.on('like', async (data) => {
      console.log(`❤️ Like recebido de: ${data.uniqueId} | Qtd: ${data.likeCount}`);

      // Se você quiser salvar no Supabase depois:
      if (supabase) {
        try {
          await supabase.from("likes").insert({
            username: data.uniqueId,
            likes: data.likeCount,
            created_at: new Date().toISOString()
          });
        } catch (err) {
          console.error("Erro ao salvar no Supabase:", err);
        }
      }
    });

    // =======================
    // ESCUTAR PRESENTES (Gifts)
    // =======================
    tiktokLive.on('gift', (data) => {
      console.log(`🎁 Presente de ${data.uniqueId}: ${data.giftName}`);
    });

    return res.json({
      message: `Conectado na live de ${username}`
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Falha ao conectar no TikTok" });
  }
});

// =======================
// 🔹 DESCONECTAR DA LIVE
// =======================
app.post('/disconnect', (req, res) => {
  if (currentConnection) {
    currentConnection.disconnect();
    currentConnection = null;
    console.log("❌ Desconectado da live");
    return res.json({ message: "Desconectado com sucesso" });
  }

  return res.status(400).json({ error: "Nenhuma live conectada" });
});

// =======================
// 🔹 INICIA O SERVIDOR
// =======================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
