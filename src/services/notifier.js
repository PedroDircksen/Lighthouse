// src/services/notifier.js
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function generateWhatsAppMessage(client, { taskName, epicName, taskDescription }) {
    const prompt = `Haja como um assistente de WhatsApp, você deve gerar uma mensagem para o cliente.
                    Gere uma mensagem curta e personalizada para enviar via WhatsApp a um cliente.
                    A mensagem deve atualizar sobre o progresso do projeto, explicando de forma leve o que foi entregue e por que isso é importante.

                    Instruções:

                    Use um tom informal, mas profissional (ex: “Oi! Passando pra te contar...”)

                    Feche com uma frase leve que transmita continuidade.

                    Não crie múltiplas opções, listas ou enumerações (ex.: "Opção 1", "Opção 2").

                    Escreva apenas uma única mensagem final, sem títulos ou marcadores.


                    Nome da tarefa: ${taskName}
                    Exemplo do cliente: ${epicName}
                    Descrição da tarefa: ${taskDescription || 'Nenhuma descrição fornecida.'}`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_API_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        }
    );

    if (!response.ok) {
        throw new Error(`Erro ao chamar API Gemini: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const message = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() + `\n\Acesse o projeto: https://hackathorion-mvp.vercel.app/auth?token=${client.jwt}`;
    return message || 'Mensagem não gerada.';
}

module.exports = { generateWhatsAppMessage };