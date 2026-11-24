/* Cuidar em Casa: ponto de entrada (v17). O código está em src/: core e domain (regras puras), data (Supabase), app (estado e gravação) e ui (telas). */
import './src/ui/dom.js';
import './src/app/catalog.js';
import './src/ui/fields.js';
import './src/app/state.js';
import './src/app/persistence.js';
import './src/app/session.js';
import './src/ui/backup.js';
import './src/ui/report.js';
import './src/ui/account.js';
import './src/app/model.js';
import './src/ui/bits.js';
import './src/ui/views.js';
import './src/ui/sheet.js';
import './src/ui/details.js';
import './src/ui/forms.js';
import './src/ui/actions.js';
import {boot} from './src/ui/account.js';
/* ---------- início ---------- */
boot();
