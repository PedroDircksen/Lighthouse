const { getSupabaseClientDBManager } = require('./db_manager')

let supabase = null;

function getSupabaseClient(){
    if(supabase == null){
        supabase = getSupabaseClientDBManager();
    }
    return supabase
}

async function insertData(table, data) {
    const supabaseInicializado = getSupabaseClient();

    const { error } = await supabaseInicializado.from(table).insert(data);

    if (error) {
        console.error(`Erro ao inserir na tabela ${table}:`, error);
        throw error;
    }
}

async function selectAllData(table, fallback){
    let dataFormated = '';
    const supabaseInicializado = getSupabaseClient();
    const column = table == 'Cursor'? 'maxUpdated' : 'id'

    const { data, error } = await supabaseInicializado.from(table).select('*');

    if (error) {
        console.error(`Erro ao buscar da tabela ${table}:`, error);
        return fallback;
    }

    if (!data || data.length == 0) {
        return fallback;
    }


    if (Array.isArray(data)) {
        dataFormated = data.map(item => item[column])
    }

    return dataFormated; 
}

async function selectDataByColumnValue(table, column, value, fallback = ""){
    const supabaseInicializado = getSupabaseClient();

    const { data, error } =  await supabaseInicializado.from(table).select('*').eq(column, value)

    if (error) {
        console.error(`Erro ao buscar da tabela ${table}:`, error);
        return fallback;
    }

    if (!data || data.length == 0) {
        return fallback;
    }

    return data[0];
}

module.exports = {
    insertData,
    selectAllData,
    selectDataByColumnValue
}