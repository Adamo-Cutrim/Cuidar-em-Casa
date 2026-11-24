/* Estado compartilhado entre os módulos da página (v17). Variáveis que mais de uma área altera ficam aqui: st.S (dados), st.hide, st.lastFocus, controles da gravação e a foto do banco. */
import {emptySnap} from '../data/sync.js';
export const st={
  S:null,
  hide:false,
  saveTimer:null,
  retryTimer:null,
  retryN:0,
  failToast:false,
  writing:false,
  dirty:false,
  dbMode:'conta',
  lastLoad:0,
  snap:emptySnap(),
  tipoIds:new Map(),
  lastFocus:null
};
