const { createClient } = require('@supabase/supabase-js');

let supabase_client = null;

async function initializeDB() {
    try {
        const supabase_url = process.env.SUPABASE_URL;
        const supabase_key = process.env.SUPABASE_API_KEY;

        if (!supabase_url || !supabase_key) {
            console.error('Supabase credentials they are not defined.');
            return;
        }

        supabase_client = createClient(supabase_url, supabase_key);
    } catch (error) {
        
    }
}

function getSupabaseClientDBManager() {
    if (!supabase_client) {
        console.error('Supabase client is not initialized, call initializeDB() first.');
        return;
    }

    return supabase_client;
}

module.exports = { initializeDB, getSupabaseClientDBManager }