
function formatMessageContent(message) {
    try {
        // Verifica se a mensagem contém texto direto
        if (message.message?.conversation) {
            return message.message.conversation;
        }

        // Verifica se é uma mensagem estendida (ex: reply ou forward)
        if (message.message?.extendedTextMessage?.text) {
            return message.message.extendedTextMessage.text;
        }

        // Verifica se a mensagem é de botão interativo
        if (message.message?.buttonsResponseMessage?.selectedButtonId) {
            return message.message.buttonsResponseMessage.selectedButtonId;
        }

        // Verifica se a mensagem é de uma lista interativa
        if (message.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
            return message.message.listResponseMessage.singleSelectReply.selectedRowId;
        }

        // Verifica se é uma mensagem de imagem com legenda
        if (message.message?.imageMessage?.caption) {
            return message.message.imageMessage.caption;
        }

        // Verifica se a mensagem é de reação (emoji)
        if (message.message?.reactionMessage?.text) {
            return message.message.reactionMessage.text;
        }

        // Verifica se é uma mensagem de vídeo com legenda
        if (message.message?.videoMessage?.caption) {
            return message.message.videoMessage.caption;
        }

        // Verifica se é uma mensagem de sticker
        if (message.message?.stickerMessage || message.message?.lottieStickerMessage) {
            return 'Sticker'; // Opcional: você pode retornar null ou algo mais específico
        }

        // Verifica se é um áudio
        if (message.message?.audioMessage) {
            return 'Audio'; // Opcional: você pode retornar null ou algo mais específico
        }

        // Retorna null se nenhum conteúdo relevante for encontrado
        return JSON.stringify(message.message);
    } catch (error) {
        console.error('Erro ao formatar a mensagem:', error);
        return null;
    }
}

function getMessageType(message) {
    if (message.message?.conversation) return 'text';
    if (message.message?.imageMessage) return 'image';
    if (message.message?.videoMessage) return 'video';
    if (message.message?.documentMessage) return 'document';
    if (message.message?.audioMessage) return 'audio';
    if (message.message?.stickerMessage) return 'sticker';
    if (message.message?.contactMessage) return 'contact';
    if (message.message?.locationMessage) return 'location';
    if (message.message?.buttonsResponseMessage) return 'button';
    if (message.message?.listResponseMessage) return 'list';
    if (message.message?.extendedTextMessage) return 'extendedText';
    if (message.message?.templateMessage) return 'template';
    if (message.message?.reactionMessage) return 'reaction';
    if (message.message?.callLogMessage) return 'callLog';
    if (message.message?.protocolMessage?.editedMessage) return 'edit';
    return 'unknown';
}

async function formatReplyToMessage(message) {
    if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation) {
        return message.message.extendedTextMessage.contextInfo.quotedMessage.conversation.length > 128
            ? message.message.extendedTextMessage.contextInfo.quotedMessage.conversation.slice(0, 124) + ' ...'
            : message.message.extendedTextMessage.contextInfo.quotedMessage.conversation;
    }
    return null;
}


async function getMediaUrl(message) {
    if (message.message?.imageMessage) {
        return message.message?.imageMessage?.url;
    }
    if (message.message?.videoMessage) {
        return message.message?.videoMessage?.url;
    }
    return null;
}

async function formatJid(jid, session) {
    const phoneOnlyDigits = jid.replace(/\D/g, '');
    const hasCountryPrefix = phoneOnlyDigits.startsWith('55');
    const phoneWithoutPrefix = hasCountryPrefix ? phoneOnlyDigits.substring(2) : phoneOnlyDigits;
    const baseJid = `55${phoneWithoutPrefix}@s.whatsapp.net`;

    const [contactInfo] = await session.onWhatsApp(baseJid);
    if (contactInfo?.exists) {
        return contactInfo.jid;
    }

    const lengthCheck = baseJid.replace(/\D/g, '').length;
    if (lengthCheck === 12) {
        const correctedPhone = phoneWithoutPrefix.slice(0, 4) + '9' + phoneWithoutPrefix.slice(4);
        const [correctedInfo] = await session.onWhatsApp(`55${correctedPhone}@s.whatsapp.net`);
        if (correctedInfo?.exists) {
            return correctedInfo.jid;
        }
    }
    else if (lengthCheck === 13) {
        const correctedPhone = phoneWithoutPrefix.slice(0, 3) + phoneWithoutPrefix.slice(4);
        const [correctedInfo] = await session.onWhatsApp(`55${correctedPhone}@s.whatsapp.net`);
        if (correctedInfo?.exists) {
            return correctedInfo.jid;
        }
    }
    return baseJid;
}

module.exports = {
    formatMessageContent,
    getMessageType,
    getMediaUrl,
    formatReplyToMessage,
    formatJid
};