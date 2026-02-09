const { WebcastPushConnection } = require('tiktok-live-connector');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const app = express();
app.use(express.json());

// 🚨 Railway exige porta dinâmica
const PORT = process.env.PORT || 8080;

// ==============================
// CONFIG SUPABASE (Railway -> Variables)
// ==============================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Guardar conexões ativas por sessão
const activeConnections = new Map();

// ==============================
// ROTAS
// ==============================

// Health check (o que você já viu no navegador)
app.get('/', (req, res) => {
  res.send('Servidor rodando no Railway 🚀');
});

app.get('/status', (req, res) => {
  res.json({
    status: "online",
    activeSessions: activeConnections.size,
    time: new Date().toISOString()
  });
});

// ==============================
// CONECTAR AO TIKTOK LIVE
// ==============================
app.post('/connect', async (req, res) => {
  const { sessionCode, tiktokUsername } = req.body;

  if (!sessionCode || !tiktokUsername) {
    return res.status(400).json({
      error: "Envie sessionCode e tiktokUsername"
    });
  }

  if (activeConnections.has(sessionCode)) {
    return res.json({
      success: false,
      error: "Sessão já conectada"
    });
  }

  try {
    const tiktokConnection = new WebcastPushConnection(tiktokUsername);

    await tiktokConnection.connect();
    activeConnections.set(sessionCode, tiktokConnection);

    console.log(`✅ Conectado na live de ${tiktokUsername}`);

    // ========== LISTENER DE LIKES ==========
    tiktokConnection.on('like', async (data) => {
      console.log(`❤️ Like recebido de ${data.uniqueId}`);

      if (!supabase) return;

      // Aqui você pode salvar no banco depois
      await supabase
        .from('battle_likes')
        .insert({
          session_code: sessionCode,
          user: data.uniqueId,
          likes: data.likeCount || 1,
          created_at: new Date()
        });
    });

    // ========== LISTENER DE GIFTS ==========
    tiktokConnection.on('gift', async (data) => {
      console.log(`🎁 Gift recebido de ${data.uniqueId}`);

      if (!supabase) return;

      const giftPoints = data.diamondCount * data.repeatCount;

      const { data: session } = await supabase
        .from('battle_sessions')
        .select('*')
        .eq('session_code', sessionCode)
        .single();

      if (!session || !session.is_battle_active) return;

      const partA = session.participant_a;
      const partB = session.participant_b;

      if (partA && data.uniqueId === partA.uniqueId) {
        await supabase
          .from('battle_sessions')
          .update({
            participant_a: {
              ...partA,
              points: (partA.points || 0) + giftPoints
            }
          })
          .eq('session_code', sessionCode);
      }
      else if (partB && data.uniqueId === partB.uniqueId) {
        await supabase
          .from('battle_sessions')
          .update({
            participant_b: {
              ...partB,
              points: (partB.points || 0) + giftPoints
            }
          })
          .eq('session_code', sessionCode);
      }
    });

    // ========== QUANDO CAIR ==========
    tiktokConnection.on('disconnected', () => {
      console.log(`❌ Live desconectada: ${tiktokUsername}`);
      activeConnections.delete(sessionCode);
    });

    return res.json({
      success: true,
      message: `Conectado à live de ${tiktokUsername}`
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================
// DESCONECTAR
// ==============================
app.post('/disconnect', (req, res) => {
  const { sessionCode } = req.body;

  const connection = activeConnections.get(sessionCode);

  if (!connection) {
    return res.json({
      success: false,
      error: "Sessão não encontrada"
    });
  }

  connection.disconnect();
  activeConnections.delete(sessionCode);

  res.json({ success: true });
});

// ==============================
// SUBIR SERVIDOR
// ==============================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
