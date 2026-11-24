/* Limites de tamanho e formatos aceitos. Fonte unica: o validador, os campos da tela e o banco usam estes valores. */
/* Tudo que vem de fora (armazenamento do aparelho ou da conta) passa por aqui antes de ser usado.
   Ids só podem ter letras, números, _ e -, porque entram em atributos HTML. Textos têm tamanho máximo. */
export const SHORT=300,LONG=5000,LIM={nome:80,tel:60,tipo:60,profissao:100,registro:60,cidade:100},ISO_D=/^\d{4}-\d{2}-\d{2}$/,HHMM=/^([01]\d|2[0-3]):[0-5]\d$/;
