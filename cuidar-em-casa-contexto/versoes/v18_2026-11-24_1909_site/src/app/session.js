/* Cliente do Supabase da página (src/data/supabase.js). A sessão mora dentro dele: SB.ses. */
import {createClient} from '../data/supabase.js';
import {SB_KEY,SB_SES,SB_URL} from './state.js';
/* Cliente do Supabase em src/data/supabase.js (v17). A sessão mora dentro dele: SB.ses (leitura) e SB.setSession(...) (troca). */
export const SB=createClient({url:SB_URL,key:SB_KEY,sesKey:SB_SES,fetchFn:function(u,o){return fetch(u,o);},storage:{session:function(){return sessionStorage;},local:function(){return localStorage;}}});
export function api(path,o){return SB.api(path,o);}
export function readSes(){return SB.readSes();}
export function storeSes(d,persist){return SB.storeSes(d,persist);}
export function clearSes(){return SB.clearSes();}
export function sbSignIn(email,pw,persist){return SB.sbSignIn(email,pw,persist);}
export function sbSignUp(nome,email,pw,persist){return SB.sbSignUp(nome,email,pw,persist);}
