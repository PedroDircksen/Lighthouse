const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const { sendMessage } = require('./whatsapp/wa');
const {
    getTeamTasks, getTask,
    hasTagCS, isDone,
    extractEpicTaskIdAuto,
    extractPhoneFromCustomFieldsByName
} = require('./integrations/clickup');
const { generateWhatsAppMessage } = require('./services/notifier');

const PROCESSED_FILE = path.join(__dirname, 'processedTasks.json');
const CURSOR_FILE = path.join(__dirname, 'clickup.cursor.json');

const env = {
    token: process.env.CLICKUP_API_TOKEN,
    teamId: process.env.CLICKUP_TEAM_ID,
    tag: process.env.CLICKUP_TAG || 'cs',
    epicsListId: process.env.CLICKUP_EPICS_LIST_ID,
    phoneFieldName: process.env.CLICKUP_CUSTOM_FIELD_PHONE_NAME,
    doneStatuses: new Set(String(process.env.CLICKUP_DONE_STATUSES || 'done,complete').split(',').map(s => s.trim().toLowerCase())),
};

async function readJsonSafely(file, fallback) {
    try {
        const raw = await fs.readFile(file, 'utf8');
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

async function saveJson(file, data) {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function loadProcessed() {
    return readJsonSafely(PROCESSED_FILE, []);
}

async function saveProcessed(ids) {
    await saveJson(PROCESSED_FILE, ids);
}

async function loadCursor() {
    return readJsonSafely(CURSOR_FILE, { date_updated_gt: 0 });
}

async function saveCursor(cursor) {
    await saveJson(CURSOR_FILE, cursor);
}

/**
 * Resolve o JID do cliente:
 * 1) Campo custom da Task (se existir)
 * 2) Campo custom do Épico (pai) – via mapeamento dos épicos na lista
 */
async function resolveClientJid({ task, env }) {
    // 1) acha o épico via relacionamento (automático)
    const epicTaskId = extractEpicTaskIdAuto(task.custom_fields);
    if (!epicTaskId) {
        console.warn(`Task ${task.id} sem relacionamento de épico detectável. Ignorando.`);
        return { jid: null, epicName: null };
    }

    // 2) carrega o épico
    const epic = await getTask({ token: env.token, taskId: epicTaskId });
    const epicName = epic?.name || null;

    // 3) extrai telefone pelo NOME do campo
    const jidFromEpic = extractPhoneFromCustomFieldsByName(epic.custom_fields, env.phoneFieldName);
    if (!jidFromEpic) {
        console.warn(`Épico ${epicTaskId} (task ${task.id}) sem telefone no campo "${env.phoneFieldName}".`);
        return { jid: null, epicName };
    }

    return { jid: jidFromEpic, epicName };
}

async function processTask(task, { processedIds, env }) {
    // Filtro: status concluído + tag CS
    if (!isDone(task.status, env.doneStatuses)) return false;
    if (!hasTagCS(task.tags, env.tag)) return false;

    if (processedIds.includes(task.id)) return false;

    const { jid, epicName } = await resolveClientJid({ task, env });
    if (!jid) {
        console.warn(`Task ${task.id} sem telefone mapeado (task/épico).`);
        return false;
    }

    const message = await generateWhatsAppMessage({ taskName: task.name, epicName, taskDescription: task.description });
    const res = await sendMessage(jid, message);

    if (res && res.error) {
        console.error(`Falha ao enviar para ${jid} task ${task.id}:`, res.error);
        return false;
    }

    return true;
}

const taskSendUpdates = cron.schedule('*/1 * * * *', async () => {
    try {
        if (!env.token || !env.teamId) {
            console.error('CLICKUP_API_TOKEN e CLICKUP_TEAM_ID são obrigatórios.');
            return;
        }

        const processedIds = await loadProcessed();
        const cursor = await loadCursor();

        let page = 0;
        let maxUpdated = Number(cursor.date_updated_gt || 0);
        let anySuccess = false;

        while (true) {
            const { tasks = [], last_page } = await getTeamTasks({
                token: env.token,
                teamId: env.teamId,
                updatedGT: maxUpdated || undefined,
                tag: env.tag,
                page
            });

            for (const t of tasks) {
                const updated = Number(t.date_updated || t.date_closed || 0);
                if (updated > maxUpdated) maxUpdated = updated;

                const sent = await processTask(t, { processedIds, env });
                if (sent) processedIds.push(t.id), anySuccess = true;
            }

            if (last_page || tasks.length === 0) break;
            page += 1;
        }

        if (anySuccess) await saveProcessed([...new Set(processedIds)]);
        if (maxUpdated > (cursor.date_updated_gt || 0)) {
            await saveCursor({ date_updated_gt: maxUpdated });
        }
    } catch (err) {
        console.error('Erro em taskSendUpdates:', err);
    }
}, { scheduled: true });

module.exports = { taskSendUpdates };
