// Remplace ces deux valeurs par celles de ton projet Supabase
// Settings > API dans le dashboard Supabase
const SUPABASE_URL  = 'https://XXXXXXXXXXXX.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOi...'; // anon public key

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
