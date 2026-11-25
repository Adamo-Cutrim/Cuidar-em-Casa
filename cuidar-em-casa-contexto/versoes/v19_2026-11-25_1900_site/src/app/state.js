/* Constantes da conta, estado da tela (ui), estado do login (auth) e acesso seguro ao armazenamento do aparelho. */
import {iso,startOfWeek} from '../core/dates.js';
/* ---------- estado e armazenamento ---------- */
export const HIDE_KEY='cuidar-em-casa:ocultar-valores';
export const SB_URL='https://ynbqblvdtgwabczbssfp.supabase.co', SB_KEY='sb_publishable_Tuay0Raxi1UIqQLi1pNrcA_hqdThXOV', SB_SES='cuidar-em-casa:sb';
export const ui={tab:'agenda',weekStart:iso(startOfWeek(new Date())),day:iso(new Date()),q:'',fcomp:'all'};
export const auth={conta:null,logged:false,mode:'',msg:'',email:''};
function readSess(k){try{return sessionStorage.getItem(k);}catch(e){return null;}}
function writeSess(k,v){try{sessionStorage.setItem(k,v);}catch(e){}}
function delLocal(k){try{localStorage.removeItem(k);}catch(e){}}
function delSess(k){try{sessionStorage.removeItem(k);}catch(e){}}
export function readLocal(k){try{return localStorage.getItem(k);}catch(e){return null;}}
export function writeLocal(k,v){try{localStorage.setItem(k,v);}catch(e){}}
