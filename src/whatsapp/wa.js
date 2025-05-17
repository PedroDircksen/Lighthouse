const {
    default: makeWASocket,
    Browsers,
    DisconnectReason,
    isJidBroadcast,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const QRCode = require('qrcode')
const { join } = require('path');


const { formatJid } = require('../utils/baileys');

const sessions = new Map();
const RECONNECT_INTERVAL = Number(process.env.RECONNECT_INTERVAL || 0);

async function init() {

    const path = './auth_info_baileys';
    const subfolders = fs.readdirSync(path, { withFileTypes: true }).filter(dirent => dirent.isDirectory());
    for (const folder of subfolders) {
        const folderPath = `${path}/${folder.name}`;
        if (!fs.readdirSync(folderPath).length) {
            fs.rmSync(folderPath, { recursive: true, force: true });
        }
    }

    const sessionId = 'hackatorion';
    const sessionPath = `./auth_info_baileys/${sessionId}`;
    if (!fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    } else {
        await createSession({ sessionId });
    }

}

async function createSession({ sessionId = 'hackatorion' }) {
    try {
        let connectionStatus = { connection: 'close' };

        const destroySession = async (logout = true) => {
            try {
                if (logout) await socket.logout();
                const sessionPath = `./auth_info_baileys/${sessionId}`;
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            } catch (error) {
                console.error(error, 'Error during session destruction');
            } finally {
                sessions.delete(sessionId);
            }
        };

        const onConnectionClose = async () => {
            const code = connectionStatus.lastDisconnect?.error?.output?.statusCode;
            const restartRequired = code === DisconnectReason.restartRequired;

            if (code === DisconnectReason.loggedOut) {
                await destroySession();
                return;
            }
            setTimeout(
                () => createSession({ sessionId }),
                restartRequired ? 0 : RECONNECT_INTERVAL
            );
        };

        const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys/${sessionId}`);
        const socket = makeWASocket({
            printQRInTerminal: true,
            browser: ['Hackatorion', "Desktop", "2.0"],
            generateHighQualityLinkPreview: true,
            auth: {
                creds: state.creds,
                keys: state.keys
            },
            shouldIgnoreJid: isJidBroadcast,
            getMessage: async (key) => {
                const message = await Message.findOne({
                    where: { sessionId, remoteJid: key.remoteJid, msgId: key.id }
                });
                return message?.message;
            },
        });

        sessions.set(sessionId, { ...socket, destroy: destroySession });

        socket.ev.on('creds.update', saveCreds);
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                console.clear()
                console.log(await QRCode.toString(qr, { type: 'terminal', small: true }))
            }

            if (connection === 'open') socket.sendPresenceUpdate('unavailable')
            if (connection === 'close') await onConnectionClose()
        });
        socket.ev.on('messages.upsert', async (messages) => {
            socket.sendPresenceUpdate('unavailable');
        });

    } catch (error) {
        console.error(error, 'Error creating session');
    }
}

async function sendMessage(phone, content, options = {}) {
    try {
        const session = getSession('hackatorion');

        if (!session) {
            throw new Error('Session not found');
        }

        if (!phone || !content) {
            throw new Error('Phone and content are required');
        }

        const jid = await formatJid(phone, session);

        const message = await session.sendMessage(jid, { text: content, ...options });

        return message;
    } catch (error) {
        if (error.text === 'The number does not exist') {
            console.error(`Erro ao enviar mensagem no WhatsApp: o número ${celular} não existe!`);
        } else {
            console.error(`Erro ao enviar mensagem no WhatsApp: ${error.text}`, { stack: error.stack });
        }
    }
}

function getSession(sessionId) {
    return sessions.get(sessionId);
}

function deleteSession(sessionId) {
    const sessionPath = `./auth_info baileys/${sessionId}`

    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true });
    }

    Session.destroy({ where: { sessionId } });

    sessions.get(sessionId)?.destroy();
}

function sessionExists(sessionId) {
    return sessions.has(sessionId) && sessions.get(sessionId).user;
}

async function jidExists(session, jid, type = 'number') {
    try {
        if (type === 'number') {
            const [result] = await session.onWhatsApp(jid);
            return !!result?.exists;
        }

        const groupMeta = await session.groupMetadata(jid);
        return !!groupMeta.id;
    } catch (error) {
        return Promise.reject(error);
    }
}

module.exports = {
    init,
    createSession,
    getSession,
    deleteSession,
    sessionExists,
    jidExists,
    sendMessage
};
