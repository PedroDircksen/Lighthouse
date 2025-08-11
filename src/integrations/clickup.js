const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const API = 'https://api.clickup.com/api/v2';
const hdrs = token => ({ Authorization: token, 'Content-Type': 'application/json' });

const normalize = v => String(v || '').trim().toLowerCase();

function hasTagCS(tags, requiredTag) {
    const req = normalize(requiredTag);
    return Array.isArray(tags) && tags.some(t => normalize(t.name || t) === req);
}

function isDone(status, doneList) {
    const s = normalize(status && status.status ? status.status : status);
    return doneList.has(s);
}

function extractPhoneFromCustomFields(customFields = [], fieldId) {
    if (!fieldId) return null;
    const f = customFields.find(cf => cf.id === fieldId);
    if (!f) return null;
    const raw = f.value || f.text || f.string || '';
    const onlyDigits = String(raw).replace(/\D+/g, '');
    if (!onlyDigits) return null;
    const br = onlyDigits.startsWith('55') ? onlyDigits : `55${onlyDigits}`;
    return `${br}@s.whatsapp.net`;
}

async function getTeamTasks({ token, teamId, updatedGT, tag, page = 0 }) {
    const params = new URLSearchParams({
        page: String(page),
        include_closed: 'true',
    });
    if (updatedGT) params.set('date_updated_gt', String(updatedGT));
    if (tag) params.append('tags[]', tag);

    const url = `${API}/team/${teamId}/task?${params.toString()}`;
    const res = await fetch(url, { headers: hdrs(token) });
    if (!res.ok) throw new Error(`ClickUp team tasks ${res.status}`);
    return res.json(); // {tasks, last_page}
}

async function getTask({ token, taskId }) {
    const res = await fetch(`${API}/task/${taskId}`, { headers: hdrs(token) });
    if (!res.ok) throw new Error(`ClickUp task ${taskId} -> ${res.status}`);
    return res.json();
}

async function getListTasks({ token, listId }) {
    const res = await fetch(`${API}/list/${listId}/task`, { headers: hdrs(token) });
    if (!res.ok) throw new Error(`ClickUp list ${listId} -> ${res.status}`);
    return res.json();
}

function norm(str) {
    return String(str || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim();
}

function findCustomFieldByName(customFields = [], fieldName) {
    if (!Array.isArray(customFields) || !fieldName) return null;
    const target = norm(fieldName);

    const matches = customFields.filter(cf => norm(cf.name) === target);
    if (!matches.length) return null;

    // prioriza tipo "phone" se existir
    const phoneTyped = matches.find(cf => norm(cf.type) === 'phone');
    return phoneTyped || matches[0];
}

function extractPhoneFromCustomFieldsByName(customFields = [], fieldName) {
    const cf = findCustomFieldByName(customFields, fieldName);
    if (!cf) return null;

    // valores possíveis no ClickUp custom field
    const raw = cf.value ?? cf.text ?? cf.string ?? cf.value_text ?? '';
    const digits = String(raw).replace(/\D+/g, '');

    if (!digits) return null;

    // Normalização simples BR -> WhatsApp JID
    // aceita números 10-13 dígitos; adiciona +55 se não houver DDI
    const withDDI = digits.startsWith('55') ? digits : `55${digits}`;
    // opcional: sanear zeros à esquerda de DDD etc., conforme seu padrão

    return `${withDDI}@s.whatsapp.net`;
}


function extractEpicTaskIdAuto(customFields = []) {
    if (!Array.isArray(customFields)) return null;

    // Candidatos: todos list_relationship com value não vazio
    const rels = customFields.filter(cf =>
        cf?.type === 'list_relationship' && Array.isArray(cf?.value) && cf.value.length > 0
    );
    if (!rels.length) return null;

    // 1) Nome contém "epico"
    const byName = rels.find(cf => norm(cf.name).includes('epico'));
    if (byName) return byName.value[0]?.id || null;

    // 2) subcategory_inverted_name contém "epic(s)"
    const bySubcat = rels.find(cf => norm(cf?.type_config?.subcategory_inverted_name || '').includes('epic'));
    if (bySubcat) return bySubcat.value[0]?.id || null;

    // 3) status do primeiro linked == "epics"
    const byStatus = rels.find(cf => norm(cf.value?.[0]?.status) === 'epics');
    if (byStatus) return byStatus.value[0]?.id || null;

    // 4) fallback: primeiro relacionamento encontrado
    return rels[0].value[0]?.id || null;
}


module.exports = {
    getTeamTasks,
    getTask,
    getListTasks,
    hasTagCS,
    isDone,
    extractPhoneFromCustomFields,
    norm,
    findCustomFieldByName,
    extractPhoneFromCustomFieldsByName,
    extractEpicTaskIdAuto
};
