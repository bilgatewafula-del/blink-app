// src/lib/privateProfile.js
// Private account details (email, phone, birthday, coin balance, ban reasons...) are no longer
// readable from the shared profile table. The owner reads their own through this function.
import { supabase } from './supabaseClient';

let cache = null; // { uid, data, t }

export async function fetchMyPrivate(uid, { force = false } = {}) {
  if (!force && cache && cache.uid === uid && Date.now() - cache.t < 20000) return cache.data;
  try {
    const { data, error } = await supabase.rpc('get_my_private_profile');
    if (error || !data) return cache?.uid === uid ? cache.data : {};
    cache = { uid, data, t: Date.now() };
    return data;
  } catch { return {}; }
}
export const clearPrivateCache = () => { cache = null; };
