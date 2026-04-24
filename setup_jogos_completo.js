require('dotenv').config({ path: './backend/.env' });
const { pool } = require('./backend/config/database');

const DIA1 = '2026-04-24';
const DIA2 = '2026-04-25';

// IDs dos times (verificado no banco)
const T = { FMC: 8, FAMINAS: 11, REDENTOR: 12, FAMESC: 13, UFRJ: 14, UNIG: 15 };

async function main() {
  await new Promise(r => setTimeout(r, 1200));

  // === 1. Buscar IDs das modalidades ===
  const [mods] = await pool.query('SELECT id, nome FROM modalidades');
  const M = {};
  for (const m of mods) {
    const n = m.nome.toLowerCase();
    if (n.includes('futsal') && n.includes('masc')) M.futsal_m = m.id;
    else if (n.includes('futsal') && n.includes('fem'))  M.futsal_f = m.id;
    else if ((n.includes('basquete') || n.includes('basket')) && n.includes('masc')) M.basquete_m = m.id;
    else if ((n.includes('basquete') || n.includes('basket')) && n.includes('fem'))  M.basquete_f = m.id;
    else if (n.includes('leil') && n.includes('masc')) M.volei_m = m.id;
    else if (n.includes('leil') && n.includes('fem'))  M.volei_f = m.id;
    else if (n.includes('hand'))                        M.handbol = m.id;
  }
  console.log('Modalidades:', JSON.stringify(M));

  // === 2. Buscar IDs dos grupos ===
  const [grps] = await pool.query('SELECT id, nome, modalidade_id FROM grupos');
  const G = {}; // G[mod_id][nome_grupo] = grupo_id
  for (const g of grps) {
    if (!G[g.modalidade_id]) G[g.modalidade_id] = {};
    G[g.modalidade_id][g.nome] = g.id;
  }
  console.log('Grupos por modalidade:', JSON.stringify(G));

  // Atalhos de grupos
  const gfmA = M.futsal_m  ? G[M.futsal_m]?.A  : null;
  const gfmB = M.futsal_m  ? G[M.futsal_m]?.B  : null;
  const gvmA = M.volei_m   ? G[M.volei_m]?.A   : null;
  const gvmB = M.volei_m   ? G[M.volei_m]?.B   : null;
  const ghA  = M.handbol   ? G[M.handbol]?.A   : null;
  const ghB  = M.handbol   ? G[M.handbol]?.B   : null;
  const gbfA = M.basquete_f? G[M.basquete_f]?.A: null;

  // === 3. Apagar todos os jogos (e dependentes) ===
  await pool.query('DELETE FROM auditoria_jogos');
  await pool.query('DELETE FROM parciais');
  await pool.query('DELETE FROM cartoes');
  await pool.query('DELETE FROM gols');
  await pool.query('DELETE FROM jogos');
  await pool.query('UPDATE grupos_times SET pontos=0,jogos=0,vitorias=0,empates=0,derrotas=0,gols_pro=0,gols_contra=0,saldo_gols=0');
  console.log('Jogos anteriores removidos.');

  // === 4. Criar jogos ===
  let total = 0;
  async function J(mod, grp, fase, casa, vis, dia, hora, local, obs) {
    const dt = `${dia} ${hora}:00`;
    await pool.query(
      `INSERT INTO jogos (modalidade_id,grupo_id,fase,time_casa_id,time_visitante_id,status,data_jogo,local_jogo,observacoes)
       VALUES (?,?,?,?,?,'agendado',?,?,?)`,
      [mod, grp || null, fase, casa, vis, dt, local, obs || null]
    );
    total++;
  }

  // ─────────────────────────────────────────────
  // DIA 1 — ANACLETO
  // ─────────────────────────────────────────────

  // Futsal Masculino — Grupos
  await J(M.futsal_m, gfmA, 'grupos',        T.FMC,    T.FAMINAS,   DIA1,'08:00','Anacleto');
  await J(M.futsal_m, gfmB, 'grupos',        T.FAMESC, T.UFRJ,      DIA1,'09:00','Anacleto');
  await J(M.futsal_m, gfmA, 'grupos',        T.FMC,    T.REDENTOR,  DIA1,'11:00','Anacleto');
  await J(M.futsal_m, gfmB, 'grupos',        T.FAMESC, T.UNIG,      DIA1,'12:00','Anacleto');
  await J(M.futsal_m, gfmA, 'grupos',        T.FAMINAS,T.REDENTOR,  DIA1,'14:00','Anacleto');
  await J(M.futsal_m, gfmB, 'grupos',        T.UFRJ,   T.UNIG,      DIA1,'15:00','Anacleto');

  // Futsal Feminino — Quartas + Semifinal
  await J(M.futsal_f, null, 'quartas',       T.UFRJ,   T.REDENTOR,  DIA1,'10:00','Anacleto');
  await J(M.futsal_f, null, 'quartas',       T.UNIG,   T.FAMESC,    DIA1,'13:00','Anacleto');
  await J(M.futsal_f, null, 'semifinal',     T.FAMINAS,T.UFRJ,      DIA1,'16:00','Anacleto','FAMINAS x Vencedor UFRJ/REDENTOR');

  // Handebol — Grupos
  await J(M.handbol,  ghA,  'grupos',        T.FAMESC, T.UFRJ,      DIA1,'18:00','Anacleto');
  await J(M.handbol,  ghB,  'grupos',        T.FMC,    T.FAMINAS,   DIA1,'19:00','Anacleto');
  await J(M.handbol,  ghA,  'grupos',        T.FAMESC, T.REDENTOR,  DIA1,'20:00','Anacleto');
  await J(M.handbol,  ghB,  'grupos',        T.FMC,    T.UNIG,      DIA1,'21:00','Anacleto');

  // ─────────────────────────────────────────────
  // DIA 1 — PADRE MELO
  // ─────────────────────────────────────────────

  // Basquete Masculino — Quartas + Semis + 3° + Final
  await J(M.basquete_m,null,'quartas',       T.FMC,    T.REDENTOR,  DIA1,'08:00','Padre Melo');
  await J(M.basquete_f,gbfA,'grupos',        T.UNIG,   T.UFRJ,      DIA1,'09:00','Padre Melo');
  await J(M.basquete_m,null,'semifinal',     T.UNIG,   T.FMC,       DIA1,'10:00','Padre Melo','UNIG x Vencedor FMC/REDENTOR');
  await J(M.basquete_f,gbfA,'grupos',        T.UNIG,   T.FAMINAS,   DIA1,'11:00','Padre Melo');
  await J(M.basquete_m,null,'quartas',       T.FAMINAS,T.UFRJ,      DIA1,'12:00','Padre Melo');
  await J(M.basquete_f,gbfA,'grupos',        T.UFRJ,   T.FAMINAS,   DIA1,'13:00','Padre Melo');
  await J(M.basquete_m,null,'semifinal',     T.FAMESC, T.FAMINAS,   DIA1,'14:00','Padre Melo','FAMESC x Vencedor FAMINAS/UFRJ');
  await J(M.basquete_m,null,'terceiro_lugar',T.REDENTOR,T.UFRJ,    DIA1,'15:00','Padre Melo','3° Lugar Basquete M — a definir');

  // Vôlei Masculino — Grupos (rodada 1)
  await J(M.volei_m, gvmA, 'grupos',        T.REDENTOR,T.FAMESC,   DIA1,'16:00','Padre Melo');
  await J(M.volei_m, gvmB, 'grupos',        T.FAMINAS, T.UFRJ,     DIA1,'17:00','Padre Melo');
  await J(M.volei_m, gvmA, 'grupos',        T.REDENTOR,T.FMC,      DIA1,'18:00','Padre Melo');

  // Vôlei Feminino — Semifinal 1
  await J(M.volei_f, null, 'semifinal',     T.UFRJ,   T.REDENTOR,  DIA1,'19:00','Padre Melo');

  // Basquete Feminino — Final
  await J(M.basquete_f,null,'final',        T.UNIG,   T.UFRJ,      DIA1,'20:00','Padre Melo','Final Basquete F — a definir');

  // Basquete Masculino — Final
  await J(M.basquete_m,null,'final',        T.UNIG,   T.FAMESC,    DIA1,'21:00','Padre Melo','Final Basquete M — a definir');

  // ─────────────────────────────────────────────
  // DIA 2 — ANACLETO
  // ─────────────────────────────────────────────

  // Handebol — Grupos (rodada final)
  await J(M.handbol,  ghA,  'grupos',       T.UFRJ,   T.REDENTOR,  DIA2,'09:00','Anacleto');
  await J(M.handbol,  ghB,  'grupos',       T.FAMINAS,T.UNIG,       DIA2,'10:00','Anacleto');

  // Handebol — 3° Lugar + Final
  await J(M.handbol,  null,'terceiro_lugar',T.FAMESC, T.FMC,        DIA2,'11:00','Anacleto','3° Lugar Handebol — a definir');

  // Futsal Masculino — Semis + 3° + Final
  await J(M.futsal_m, null,'semifinal',    T.FMC,    T.UFRJ,       DIA2,'12:00','Anacleto','Semifinal Futsal M — a definir');
  await J(M.futsal_m, null,'semifinal',    T.FAMESC, T.FAMINAS,     DIA2,'14:00','Anacleto','Semifinal Futsal M — a definir');

  // Futsal Feminino — 3° Lugar
  await J(M.futsal_f, null,'terceiro_lugar',T.UNIG,  T.REDENTOR,   DIA2,'15:00','Anacleto','3° Lugar Futsal F — a definir');

  // Futsal Masculino — 3° Lugar
  await J(M.futsal_m, null,'terceiro_lugar',T.REDENTOR,T.UNIG,     DIA2,'16:00','Anacleto','3° Lugar Futsal M — a definir');

  // Finais no Anacleto
  await J(M.handbol,  null,'final',        T.FMC,    T.FAMESC,     DIA2,'18:00','Anacleto','Final Handebol — a definir');
  await J(M.futsal_f, null,'final',        T.FAMINAS,T.UNIG,       DIA2,'19:00','Anacleto','Final Futsal F — a definir');
  await J(M.futsal_m, null,'final',        T.FMC,    T.FAMESC,     DIA2,'20:00','Anacleto','Final Futsal M — a definir');

  // ─────────────────────────────────────────────
  // DIA 2 — PADRE MELO
  // ─────────────────────────────────────────────

  // Vôlei Masculino — Grupos (rodada 2 e 3)
  await J(M.volei_m, gvmB, 'grupos',       T.FAMINAS,T.UNIG,       DIA2,'09:00','Padre Melo');
  await J(M.volei_f, null, 'semifinal',    T.FAMESC, T.FAMINAS,     DIA2,'10:00','Padre Melo');
  await J(M.volei_m, gvmA, 'grupos',       T.FMC,    T.FAMESC,      DIA2,'11:00','Padre Melo');
  await J(M.volei_m, gvmB, 'grupos',       T.UFRJ,   T.UNIG,        DIA2,'12:00','Padre Melo');

  // Vôlei Masculino — 3° + Final
  await J(M.volei_m, null,'terceiro_lugar',T.FAMESC, T.UFRJ,        DIA2,'13:00','Padre Melo','3° Lugar Vôlei M — a definir');

  // Vôlei Feminino — 3° + Final
  await J(M.volei_f, null,'terceiro_lugar',T.REDENTOR,T.FAMINAS,   DIA2,'14:00','Padre Melo','3° Lugar Vôlei F — a definir');
  await J(M.volei_m, null,'final',         T.FMC,    T.FAMINAS,     DIA2,'15:00','Padre Melo','Final Vôlei M — a definir');
  await J(M.volei_f, null,'final',         T.UFRJ,   T.FAMINAS,     DIA2,'16:00','Padre Melo','Final Vôlei F — a definir');

  const [cnt] = await pool.query('SELECT COUNT(*) as c FROM jogos');
  console.log(`\n✅ ${cnt[0].c} jogos criados com sucesso!`);

  // Resumo por modalidade
  const [res] = await pool.query(`
    SELECT m.nome, COUNT(*) as total
    FROM jogos j JOIN modalidades m ON j.modalidade_id = m.id
    GROUP BY m.nome ORDER BY m.nome
  `);
  console.log('\nJogos por modalidade:');
  res.forEach(r => console.log(`  ${r.nome}: ${r.total}`));

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
