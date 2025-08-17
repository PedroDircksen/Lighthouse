const cron = require('node-cron');
const { sendMessage } = require('./whatsapp/wa');
const { insertData, selectAllData, selectDataByColumnValue } = require('./database/database');
const Client = require('./models/client');
const {
    getTeamTasks, getTask,
    hasTagCS, isDone,
    extractEpicTaskIdAuto,
    extractPhoneFromCustomFieldsByName
} = require('./integrations/clickup');
const { generateWhatsAppMessage } = require('./services/notifier');

const env = {
    token: process.env.CLICKUP_API_TOKEN,
    teamId: process.env.CLICKUP_TEAM_ID,
    tag: process.env.CLICKUP_TAG || 'cs',
    epicsListId: process.env.CLICKUP_EPICS_LIST_ID,
    phoneFieldName: process.env.CLICKUP_CUSTOM_FIELD_PHONE_NAME,
    doneStatuses: new Set(String(process.env.CLICKUP_DONE_STATUSES || 'done,complete').split(',').map(s => s.trim().toLowerCase())),
};

async function loadProcessed() {
    return await selectAllData('ProcessedTasks', []);
}

async function loadCursor() {
    return await selectAllData('Cursor', { date_updated_gt: 0 });
}

async function saveProcessed(ids) {
    const payload = ids.map(id => ({ id }));
    await insertData('ProcessedTasks', payload);
}

async function saveCursor(cursor) {
    await insertData('Cursor', cursor);
}

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
    if (!isDone(task.status, env.doneStatuses)) return { markProcessed: false, sent: false };
    if (!hasTagCS(task.tags, env.tag)) return { markProcessed: false, sent: false };

    if (processedIds.includes(task.id)) return { markProcessed: false, sent: false };

    const { jid, epicName } = await resolveClientJid({ task, env });
    if (!jid) {
        console.warn(`Task ${task.id} sem telefone mapeado (task/épico).`);
        // Marcamos como processada para não ficar tentando para sempre
        return { markProcessed: true, sent: false };
    }

    const phone = jid.split('@')[0];

    // Extração defensiva do(s) épico(s)
    const epic_id = (task.custom_fields || [])
        .filter(cf =>
            cf?.type_config?.subcategory_inverted_name === 'Épics' &&
            Array.isArray(cf?.value) &&
            cf.value.length > 0
        )
        .map(cf => cf.value[0]?.id)
        .filter(Boolean);

    let client = await selectDataByColumnValue('Client', 'phone', phone, '');
    if (client == '') {
        client = new Client(phone, epic_id);
        await insertData('Client', client.formatDataToInsert());
    }

    const message = await generateWhatsAppMessage(client, {
        taskName: task.name,
        epicName,
        taskDescription: task.description
    });

    const res = await sendMessage(jid, message);

    if (res && res.error) {
        console.error(`Falha ao enviar para ${jid} task ${task.id}:`, res.error);
        // Mesmo com erro de envio, marcamos como processada para evitar loop/spam
        return { markProcessed: true, sent: false };
    }

    return { markProcessed: true, sent: true };
}

const taskSendUpdates = cron.schedule('*/1 * * * *', async () => {
    try {
        if (!env.token || !env.teamId) {
            console.error('CLICKUP_API_TOKEN e CLICKUP_TEAM_ID são obrigatórios.');
            return;
        }

        const processedIds = await loadProcessed();
        const cursor = await loadCursor();
        const processedBefore = await loadProcessed();


        let page = 0;
        let maxUpdated = Number(cursor.date_updated_gt || 0);
        let anyProcessed = false;
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

                const result = await processTask(t, { processedIds, env });
                if (result?.markProcessed) {
                    processedIds.push(t.id);
                    anyProcessed = true;
                }
                if (result?.sent) {
                    anySuccess = true;
                }
            }

            if (last_page || tasks.length === 0) break;
            page += 1;
        }

        if (anyProcessed) {
            const newIds = processedIds.filter(id => !processedBefore.includes(id));
            if (newIds.length > 0) {
                await saveProcessed(newIds);
            }
        }

        if (maxUpdated > (cursor.date_updated_gt || 0)) {
            await saveCursor(maxUpdated);
        }
    } catch (err) {
        console.error('Erro em taskSendUpdates:', err);
    }
}, { scheduled: true });

module.exports = { taskSendUpdates };
