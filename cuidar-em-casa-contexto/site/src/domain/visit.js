/* Valor do atendimento no histórico (v18a, decidido em 24/11/2026): o valor é guardado NO MOMENTO em que o atendimento é marcado como feito,
   então mudar o preço do paciente depois não altera o que já foi realizado. Sem rede, sem DOM, sem estado global. */
import {numOrNull} from '../core/money.js';

/* Valor que o paciente tem cadastrado agora, ou null quando não há valor (vazio, inválido ou fora do limite). Zero é um valor. */
export function snapshotValue(p){
  if(!p||p.valor==null||p.valor==='') return null;
  return numOrNull(p.valor);
}
/* Muda o status do atendimento e mantém o valor guardado coerente:
   - ao virar "feito" (vindo de outro status), guarda o valor atual do paciente (null = sem valor);
   - ao sair de "feito" (voltar a agendado ou cancelar), apaga o valor guardado;
   - se já era "feito" e continua "feito", não troca o valor guardado. */
export function setStatus(v,status,patient){
  const antes=v.status;
  v.status=status;
  if(status==='feito'){if(antes!=='feito') v.valorSnapshot=snapshotValue(patient);}
  else delete v.valorSnapshot;
  return v;
}
