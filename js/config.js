// Remplace ces deux valeurs par celles de ton projet Supabase
// Settings > API dans le dashboard Supabase
const SUPABASE_URL  = 'https://zwyalfnyplkojumdvtvt.supabase.co';
const SUPABASE_ANON = 'sb_publishable_jLfgEbdyuBmNn1yjwTcJYg_YaGjSPle';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
