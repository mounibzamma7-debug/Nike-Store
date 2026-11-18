
const SUPABASE_URL = "https://tcenulavthdjsgzgjkeg.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vJncM19w8P7_JpPU25lU5w_DWiq__g5";

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
