const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const { sendMessage } = require('./whatsapp/wa');
const { GoogleSheetsService } = require('../googleApi');

const CLICKUP_URL = 'https://api.clickup.com/api/v2/list/901312348941/task?statuses[]=complete';
const CLICKUP_OPTS = {
    method: 'GET',
    headers: { Authorization: process.env.CLICKUP_API_KEY }
};

const PROCESSED_FILE = path.join(__dirname, 'processedTasks.json');
const GEMINI_URL = model =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

// Prompt exato conforme instruído
const GEMINI_PROMPT = `Haja como um assistente de WhatsApp, você deve gerar uma mensagem para o cliente.
Gere uma mensagem curta e personalizada para enviar via WhatsApp a um cliente.
A mensagem deve atualizar sobre o progresso do projeto, explicando de forma leve o que foi entregue e por que isso é importante.

Instruções:

Use um tom informal, mas profissional (ex: “Oi! Passando pra te contar...”)

Resuma em 2 ou 3 frases o que foi feito e o benefício disso

Feche com uma frase leve que transmita continuidade`;

async function loadProcessedIds() {
    try {
        const content = await fs.readFile(PROCESSED_FILE, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT') return []; // arquivo não existe ainda
        throw err;
    }
}

async function saveProcessedIds(ids) {
    await fs.writeFile(PROCESSED_FILE, JSON.stringify(ids, null, 2), 'utf8');
}

async function generateWhatsAppMessage(newTask) {

    const raw = JSON.stringify({
        contents: [
            {
                parts: [{ text: `${GEMINI_PROMPT}\n${JSON.stringify(newTask)}` }]
            }
        ]
    });

    const res = await fetch(GEMINI_URL('gemini-2.0-flash'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.statusText}`);

    const json = await res.json();
    // O campo 'candidates[0].content' contém o texto gerado :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}
    return json.candidates[0].content;
}

const taskSendUpdates = cron.schedule('*/5 * * * * *', async () => {
    try {
        const [processedIds, clickupRes] = await Promise.all([
            loadProcessedIds(),
            fetch(CLICKUP_URL, CLICKUP_OPTS)
        ]);

        const clickupJson = await clickupRes.json();
        const closedTasks = clickupJson.tasks;

        const newTasks = closedTasks.filter(t => !processedIds.includes(t.id));

        for (const task of newTasks) {
            // Aciona a Gemini API e obtém a mensagem
            const message = await generateWhatsAppMessage(task);
            console.log(`Mensagem gerada: ${JSON.stringify(message)}`);
            const sheets = new GoogleSheetsService();

            sheets.getSheetNames().then(async (names) => {
                console.log('Abas disponíveis:', names);

                const aba = names[0];

                sheets.fetchAll(`${aba}!A1:C`).then(async (data) => {
                    for (const item of data) {
                        await sendMessage(item["Telefone (WhatsApp)"], message.parts[0].text);
                        // Random delay between 2-5 seconds
                        const delay = Math.floor(Math.random() * (5000 - 2000) + 2000);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                })
            })

        }

        // Atualiza o arquivo com todas as IDs processadas
        const allIds = Array.from(new Set([
            ...processedIds,
            ...newTasks.map(t => t.id)
        ]));
        await saveProcessedIds(allIds);

    } catch (error) {
        console.error('Erro em taskSendUpdates:', error);
    }
}, { scheduled: true });

module.exports = { taskSendUpdates };
