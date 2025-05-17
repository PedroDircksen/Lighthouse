const express = require('express');
const { sendMessage } = require('./src/whatsapp/wa');
const { transporter } = require('./src/utils/mailService');
const router = express.Router()

router.post('/message/send', async (req, res) => {
  const { phone, message } = req.body;

  try {
    let content = message;

    const result = await sendMessage(phone, content);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({ error: "Failed to send message" });
  }

})

function randomDelay(minMs, maxMs) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

router.post('/message/bulk-send', async (req, res) => {
  const { phones, message } = req.body;

  // validação básica
  if (!Array.isArray(phones) || phones.length === 0 || !message) {
    return res
      .status(400)
      .json({ error: 'phones (array) e message são obrigatórios.' });
  }

  const results = [];

  for (const phone of phones) {
    try {
      const result = await sendMessage(phone, message);
      if (result.error) {
        results.push({ phone, success: false, error: result.error });
      } else {
        results.push({ phone, success: true });
      }
    } catch (err) {
      console.error(`Erro ao enviar para ${phone}:`, err);
      results.push({
        phone,
        success: false,
        error: err.message || 'Erro desconhecido',
      });
    }

    // espera de 2000ms a 5000ms antes do próximo envio
    await randomDelay(2000, 5000);
  }

  // Se ao menos um envio teve sucesso, retorna 200; caso contrário 500
  const anySuccess = results.some(r => r.success);
  res.status(anySuccess ? 200 : 500).json({ results });
});


module.exports = router 