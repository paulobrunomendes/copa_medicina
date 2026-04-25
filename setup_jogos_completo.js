require('dotenv').config({ path: './backend/.env' });
const { pool } = require('./backend/config/database');

const DIA1 = '2026-04-24';
const DIA2 = '2026-04-25';

const T = { FMC: 8, FAMINAS: 11, REDENTOR: 12, FAMESC: 13, UFRJ: 14, UNIG: 15 };

async function main() {
  await new Promise(r => setTimeout(r, 1200));

  // Buscar IDs das modalidades
  const [mods] = await pool.query('SELECT id, nome FROM modalidades');
  const M = {};
  for (const m of mods) {
    const n = m.nome.toLowerCase();
    if      (n.includes('futsal') && n.includes('masc'))                      M.futsal_m   = m.id;
    else if (n.includes('futsal') && n.includes('fem'))                       M.futsal_f   = m.id;
    else if ((n.includes('basquete')||n.includes('basket')) && n.includes('masc')) M.basquete_m = m.id;
    else if ((n.includes('basquete')||n.includes('basket')) && n.includes('fem'))  M.basquete_f = m.id;
    else if (n.includes('lei') && n.includes('masc'))                        M.volei_m    = m.id;
    else if (n.includes('lei') && n.includes('fem'))                         M.volei_f    = m.id;
    else if (n.includes('hand'))                                               M.handbol    = m.id;
  }
  console.log('Modalidades:', JSON.stringify(M));

  // Buscar IDs dos grupos
  const [grps] = await pool.query('SELECT id, nome, modalidade_id FROM grupos');
  const G = {};
  for (const g of grps) {
    if (!G[g.modalidade_id]) G[g.modalidade_id] = {};
    G[g.modalidade_id][g.nome] = g.id;
  }

  const gfmA = M.futsal_m   ? G[M.futsal_m]?.A   : null;
  const gfmB = M.futsal_m   ? G[M.futsal_m]?.B   : null;
  const gvmA = M.volei_m    ? G[M.volei_m]?.A    : null;
  const gvmB = M.volei_m    ? G[M.volei_m]?.B    : null;
  const ghA  = M.handbol    ? G[M.handbol]?.A    : null;
  const ghB  = M.handbol    ? G[M.handbol]?.B    : null;
  const gbfA = M.basquete_f ? G[M.basquete_f]?.A : null;

  // Apagar tudo
  await pool.query('DELETE FROM auditoria_jogos');
  await pool.query('DELETE FROM parciais');
  await pool.query('DELETE FROM cartoes');
  await pool.query('DELETE FROM gols');
  await pool.query('DELETE FROM jogos');
  await pool.query('UPDATE grupos_times SET pontos=0,jogos=0,vitorias=0,empates=0,derrotas=0,gols_pro=0,gols_contra=0,saldo_gols=0');
  console.log('Jogos anteriores removidos.');

  let total = 0;

  // dia e hora = null → jogo sem data (aguardando definição de times)
  async function J(mod, grp, fase, casa, vis, dia, hora, local, obs) {
    const dt = (dia && hora) ? `${dia} ${hora}:00` : null;
    await pool.query(
      `INSERT INTO jogos (modalidade_id,grupo_id,fase,time_casa_id,time_visitante_id,status,data_jogo,local_jogo,observacoes)
       VALUES (?,?,?,?,?,'agendado',?,?,?)`,
      [mod, grp || null, fase, casa, vis, dt, local, obs || null]
    );
    total++;
  }

  // ═══════════════════════════════════════════════
  // DIA 1 — ANACLETO  (times definidos → com data)
  // ═══════════════════════════════════════════════

  // Futsal Masculino — Grupos (todos com data)
  await J(M.futsal_m, gfmA, 'grupos',    T.FMC,    T.FAMINAS,   DIA1,'08:00','Anacleto');
  await J(M.futsal_m, gfmB, 'grupos',    T.FAMESC, T.UFRJ,      DIA1,'09:00','Anacleto');
  await J(M.futsal_m, gfmA, 'grupos',    T.FMC,    T.REDENTOR,  DIA1,'11:00','Anacleto');
  await J(M.futsal_m, gfmB, 'grupos',    T.FAMESC, T.UNIG,      DIA1,'12:00','Anacleto');
  await J(M.futsal_m, gfmA, 'grupos',    T.FAMINAS,T.REDENTOR,  DIA1,'14:00','Anacleto');
  await J(M.futsal_m, gfmB, 'grupos',    T.UFRJ,   T.UNIG,      DIA1,'15:00','Anacleto');

  // Futsal Feminino — Quartas (times definidos → com data)
  await J(M.futsal_f, null, 'quartas',   T.UFRJ,   T.REDENTOR,  DIA1,'10:00','Anacleto');
  await J(M.futsal_f, null, 'quartas',   T.UNIG,   T.FAMESC,    DIA1,'13:00','Anacleto');
  // Semifinal — time adversário depende de resultado → SEM DATA
  await J(M.futsal_f, null, 'semifinal', T.FAMINAS,T.UFRJ,      null, null,  'Anacleto','Dia 1 16h | FAMINAS x Vencedor UFRJ/REDENTOR');

  // Handebol — Grupos (todos com data)
  await J(M.handbol,  ghA,  'grupos',    T.FAMESC, T.UFRJ,      DIA1,'18:00','Anacleto');
  await J(M.handbol,  ghB,  'grupos',    T.FMC,    T.FAMINAS,   DIA1,'19:00','Anacleto');
  await J(M.handbol,  ghA,  'grupos',    T.FAMESC, T.REDENTOR,  DIA1,'20:00','Anacleto');
  await J(M.handbol,  ghB,  'grupos',    T.FMC,    T.UNIG,      DIA1,'21:00','Anacleto');

  // ═══════════════════════════════════════════════
  // DIA 1 — PADRE MELO
  // ═══════════════════════════════════════════════

  // Basquete M — Quartas (times definidos → com data)
  await J(M.basquete_m,null,'quartas',   T.FMC,    T.REDENTOR,  DIA1,'08:00','Padre Melo');
  // Semis dependem dos QF → SEM DATA
  await J(M.basquete_m,null,'semifinal', T.UNIG,   T.FMC,       null, null,  'Padre Melo','Dia 1 10h | UNIG x Vencedor FMC/REDENTOR');

  await J(M.basquete_m,null,'quartas',   T.FAMINAS,T.UFRJ,      DIA1,'12:00','Padre Melo');
  await J(M.basquete_m,null,'semifinal', T.FAMESC, T.FAMINAS,   null, null,  'Padre Melo','Dia 1 14h | FAMESC x Vencedor FAMINAS/UFRJ');

  // 3° lugar e Final → SEM DATA
  await J(M.basquete_m,null,'terceiro_lugar',T.REDENTOR,T.UFRJ, null, null,  'Padre Melo','Dia 1 15h | 3° Lugar Basquete M');
  await J(M.basquete_m,null,'final',     T.UNIG,   T.FAMESC,    null, null,  'Padre Melo','Dia 1 21h | Final Basquete M');

  // Basquete Feminino — Round-robin (times definidos → com data)
  await J(M.basquete_f,gbfA,'grupos',    T.UNIG,   T.UFRJ,      DIA1,'09:00','Padre Melo');
  await J(M.basquete_f,gbfA,'grupos',    T.UNIG,   T.FAMINAS,   DIA1,'11:00','Padre Melo');
  await J(M.basquete_f,gbfA,'grupos',    T.UFRJ,   T.FAMINAS,   DIA1,'13:00','Padre Melo');
  // Final → SEM DATA
  await J(M.basquete_f,null,'final',     T.UNIG,   T.UFRJ,      null, null,  'Padre Melo','Dia 1 20h | Final Basquete F');

  // Vôlei Masculino — Grupos rodada 1 (com data)
  await J(M.volei_m, gvmA, 'grupos',    T.REDENTOR,T.FAMESC,   DIA1,'16:00','Padre Melo');
  await J(M.volei_m, gvmB, 'grupos',    T.FAMINAS, T.UFRJ,     DIA1,'17:00','Padre Melo');
  await J(M.volei_m, gvmA, 'grupos',    T.REDENTOR,T.FMC,      DIA1,'18:00','Padre Melo');

  // Vôlei Feminino — Semifinal 1 (times definidos → com data)
  await J(M.volei_f, null, 'semifinal', T.UFRJ,   T.REDENTOR,  DIA1,'19:00','Padre Melo');

  // ═══════════════════════════════════════════════
  // DIA 2 — ANACLETO
  // ═══════════════════════════════════════════════

  // Handebol — última rodada (com data)
  await J(M.handbol,  ghA,  'grupos',   T.UFRJ,   T.REDENTOR,  DIA2,'09:00','Anacleto');
  await J(M.handbol,  ghB,  'grupos',   T.FAMINAS,T.UNIG,       DIA2,'10:00','Anacleto');

  // Handebol eliminatórias → SEM DATA
  await J(M.handbol,  null,'terceiro_lugar',T.FAMESC,T.FMC,     null, null,  'Anacleto','Dia 2 11h | 3° Lugar Handebol');
  await J(M.handbol,  null,'final',     T.FMC,    T.FAMESC,     null, null,  'Anacleto','Dia 2 18h | Final Handebol');

  // Futsal M eliminatórias → SEM DATA
  await J(M.futsal_m, null,'semifinal', T.FMC,    T.UFRJ,       null, null,  'Anacleto','Dia 2 12h | Semifinal Futsal M');
  await J(M.futsal_m, null,'semifinal', T.FAMESC, T.FAMINAS,    null, null,  'Anacleto','Dia 2 14h | Semifinal Futsal M');
  await J(M.futsal_f, null,'terceiro_lugar',T.UNIG,T.REDENTOR,  null, null,  'Anacleto','Dia 2 15h | 3° Lugar Futsal F');
  await J(M.futsal_m, null,'terceiro_lugar',T.REDENTOR,T.UNIG,  null, null,  'Anacleto','Dia 2 16h | 3° Lugar Futsal M');
  await J(M.futsal_f, null,'final',     T.FAMINAS,T.UNIG,       null, null,  'Anacleto','Dia 2 19h | Final Futsal F');
  await J(M.futsal_m, null,'final',     T.FMC,    T.FAMESC,     null, null,  'Anacleto','Dia 2 20h | Final Futsal M');

  // ═══════════════════════════════════════════════
  // DIA 2 — PADRE MELO
  // ═══════════════════════════════════════════════

  // Vôlei M — últimas rodadas (com data)
  await J(M.volei_m, gvmB, 'grupos',   T.FAMINAS,T.UNIG,       DIA2,'09:00','Padre Melo');
  await J(M.volei_m, gvmA, 'grupos',   T.FMC,    T.FAMESC,      DIA2,'11:00','Padre Melo');
  await J(M.volei_m, gvmB, 'grupos',   T.UFRJ,   T.UNIG,        DIA2,'12:00','Padre Melo');

  // Vôlei F — Semifinal 2 (times definidos → com data)
  await J(M.volei_f, null, 'semifinal',T.FAMESC, T.FAMINAS,     DIA2,'10:00','Padre Melo');

  // Eliminatórias Vôlei → SEM DATA
  await J(M.volei_m, null,'terceiro_lugar',T.FAMESC,T.UFRJ,     null, null,  'Padre Melo','Dia 2 13h | 3° Lugar Vôlei M');
  await J(M.volei_f, null,'terceiro_lugar',T.REDENTOR,T.FAMINAS,null, null,  'Padre Melo','Dia 2 14h | 3° Lugar Vôlei F');
  await J(M.volei_m, null,'final',     T.FMC,    T.FAMINAS,     null, null,  'Padre Melo','Dia 2 15h | Final Vôlei M');
  await J(M.volei_f, null,'final',     T.UFRJ,   T.FAMINAS,     null, null,  'Padre Melo','Dia 2 16h | Final Vôlei F');

  // Resumo
  const [cnt] = await pool.query('SELECT COUNT(*) as c FROM jogos');
  const [comData] = await pool.query('SELECT COUNT(*) as c FROM jogos WHERE data_jogo IS NOT NULL');
  const [semData] = await pool.query('SELECT COUNT(*) as c FROM jogos WHERE data_jogo IS NULL');
  console.log(`\n✅ ${cnt[0].c} jogos criados!`);
  console.log(`   Com data/hora: ${comData[0].c}`);
  console.log(`   Sem data (a definir): ${semData[0].c}`);

  const [res] = await pool.query(`
    SELECT m.nome, COUNT(*) as total
    FROM jogos j JOIN modalidades m ON j.modalidade_id = m.id
    GROUP BY m.nome ORDER BY m.nome
  `);
  console.log('\nPor modalidade:');
  res.forEach(r => console.log(`  ${r.nome}: ${r.total}`));

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
