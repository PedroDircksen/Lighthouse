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

router.post('/mail/send', async (req, res) => {
  const { email, subject, message } = req.body;

  try {
    await transporter.sendMail({
      from: process.env.MAIL_USERNAME,
      to: email,
      subject,
      text: message,
    });

    return res.json({ message: 'Email enviado com sucesso' });
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    return res.status(500).json({ error: 'Falha ao enviar e-mail' });
  }
});



module.exports = router 