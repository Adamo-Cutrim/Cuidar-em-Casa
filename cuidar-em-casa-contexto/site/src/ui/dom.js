/* Atalhos de DOM: seletor, ícone e baixar arquivo. */
/* ---------- utilidades ---------- */
export const $=(s,r)=>(r||document).querySelector(s);
export const ic=n=>'<svg class="i" aria-hidden="true"><use href="#i-'+n+'"/></svg>';

export function dlFile(name,text,mime){
  const b=new Blob([text],{type:mime+';charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');
  a.href=u;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();
  setTimeout(function(){a.remove();URL.revokeObjectURL(u);},2000);
}
