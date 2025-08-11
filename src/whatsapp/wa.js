const {
    default: makeWASocket,
    DisconnectReason,
    isJidBroadcast,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const QRCode = require('qrcode');
const { formatJid } = require('../utils/baileys');

const sessions = new Map();
const RECONNECT_INTERVAL = Number(process.env.RECONNECT_INTERVAL || 5000);
const MAX_RECONNECT_RETRIES = Number(process.env.MAX_RECONNECT_RETRIES || 5);
const retries = new Map();

async function cleanEmptyAuthFolders() {
    const path = './auth_info_baileys';
    const subfolders = fs.readdirSync(path, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());
    for (const folder of subfolders) {
        const folderPath = `${path}/${folder.name}`;
        if (!fs.readdirSync(folderPath).length) {
            fs.rmSync(folderPath, { recursive: true, force: true });
        }
    }
}

async function init() {
    await cleanEmptyAuthFolders();
    await createSession({ sessionId: 'hackatorion' });
}

function shouldReconnect(sessionId) {
    const attempts = retries.get(sessionId) || 0;
    if (attempts < MAX_RECONNECT_RETRIES) {
        retries.set(sessionId, attempts + 1);
        return true;
    }
    return false;
}

async function createSession({ sessionId }) {
    let socket;
    const destroySession = async (logout = true) => {
        if (logout && socket) await socket.logout();
        const sessionPath = `./auth_info_baileys/${sessionId}`;
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        sessions.delete(sessionId);
        retries.delete(sessionId);
    };

    let version = [2, 2314, 11];
    try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
    } catch (err) {
        console.warn('Erro ao obter versão do WhatsApp Web', err);
    }

    const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys/${sessionId}`);
    socket = makeWASocket({
        version,
        printQRInTerminal: true,
        browser: ['Lighthouse', "Desktop", "2.0"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, console),
        },
        generateHighQualityLinkPreview: true,
        shouldIgnoreJid: isJidBroadcast,
    });

    sessions.set(sessionId, { ...socket, destroy: destroySession });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.clear();
            console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
        }

        if (connection === 'open') {
            retries.delete(sessionId);
            socket.sendPresenceUpdate('unavailable');
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut || !shouldReconnect(sessionId)) {
                await destroySession();
                return;
            }
            const timeout = code === DisconnectReason.restartRequired ? 0 : RECONNECT_INTERVAL;
            console.log(`Reconectando sessão "${sessionId}" em ${timeout}ms.`);
            setTimeout(() => createSession({ sessionId }), timeout);
        }
    });

    socket.ev.on('messages.upsert', () => {
        socket.sendPresenceUpdate('unavailable');
    });
}

async function sendMessage(phone, content, options = {}) {
    const session = sessions.get('hackatorion');
    if (!session) throw new Error('Sessão não encontrada.');

    const jid = await formatJid(phone, session);
    return await session.sendMessage(jid, { text: content, ...options });
}

module.exports = {
    init,
    createSession,
    getSession: (id) => sessions.get(id),
    sendMessage
};