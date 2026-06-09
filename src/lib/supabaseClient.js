import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nhxymqfpweywwylxmuju.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeHltcWZwd2V5d3d5bHhtdWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTkyOTAsImV4cCI6MjA5NTg3NTI5MH0.OCqzmAsdlSeHbUYc0cxzZdySf0jm-FkQ-U_1Kfg5rAM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);