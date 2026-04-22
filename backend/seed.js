/**
 * SEED — Dados de Exemplo
 * Execute com: node seed.js
 * Popula o banco com times, grupos e jogos de exemplo para testar o sistema.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, initDB } = require('./config/database');

async function seed() {
  await initDB();
  const conn = await pool.getConnection();

  try {
    console.log('\n🌱 Iniciando seed de dados de exemplo...\n');

    // ── Admin ──────────────────────────────────────────────────────
    const [admins] = await conn.query('SELECT COUNT(*) as total FROM admins');
    if (admins[0].total === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await conn.query(
        'INSERT INTO admins (nome, email, senha) VALUES (?, ?, ?)',
        ['Administrador', 'admin@copa.med', hash]
      );
      console.log('✅ Admin criado: admin@copa.med / admin123');
    } else {
      console.log('⏭  Admin já existe, pulando...');
    }

    // ── Modalidades ────────────────────────────────────────────────
    const [mods] = await conn.query('SELECT * FROM modalidades');
    const modMap = {};
    mods.forEach(m => modMap[m.nome] = m.id);
    console.log('✅ Modalidades carregadas:', Object.keys(modMap).join(', '));

    // ── Times ──────────────────────────────────────────────────────
    const timesData = [
      { nome: 'Medicina UERJ',  sigla: 'UERJ', cor: '#003087', curso: 'Medicina - UERJ' },
      { nome: 'Medicina UFF',   sigla: 'UFF',  cor: '#00843D', curso: 'Medicina - UFF' },
      { nome: 'Medicina UFRJ',  sigla: 'UFRJ', cor: '#005BAC', curso: 'Medicina - UFRJ' },
      { nome: 'Medicina PUC',   sigla: 'PUC',  cor: '#002060', curso: 'Medicina - PUC-Rio' },
      { nome: 'Medicina UNESA', sigla: 'NESA', cor: '#C41E3A', curso: 'Medicina - Unesa' },
      { nome: 'Medicina UNIRIO',sigla: 'UNIR', cor: '#7B2D8B', curso: 'Medicina - UniRio' },
      { nome: 'Medicina FESO',  sigla: 'FESO', cor: '#E87722', curso: 'Medicina - FESO' },
      { nome: 'Medicina UNIFOA',sigla: 'UFOA', cor: '#1D6FA4', curso: 'Medicina - UniFOA' },
    ];

    const [timesExist] = await conn.query('SELECT COUNT(*) as total FROM times');
    if (timesExist[0].total === 0) {
      for (const t of timesData) {
        await conn.query(
          'INSERT INTO times (nome, sigla, cor, curso) VALUES (?, ?, ?, ?)',
          [t.nome, t.sigla, t.cor, t.curso]
        );
      }
      console.log(`✅ ${timesData.length} times criados`);
    } else {
      console.log('⏭  Times já existem, pulando...');
    }

    // Recarregar times
    const [times] = await conn.query('SELECT * FROM times');
    const timeMap = {};
    times.forEach(t => timeMap[t.sigla] = t.id);

    // ── Grupos de Futebol ─────────────────────────────────────────
    const [gruposExist] = await conn.query('SELECT COUNT(*) as total FROM grupos');
    if (gruposExist[0].total === 0) {
      const futId = modMap['Futebol'];

      // Grupo A
      const [ga] = await conn.query('INSERT INTO grupos (nome, modalidade_id) VALUES (?, ?)', ['A', futId]);
      const grupoA = ga.insertId;
      for (const sigla of ['UERJ', 'UFF', 'UFRJ', 'PUC']) {
        await conn.query('INSERT IGNORE INTO grupos_times (grupo_id, time_id) VALUES (?, ?)', [grupoA, timeMap[sigla]]);
      }

      // Grupo B
      const [gb] = await conn.query('INSERT INTO grupos (nome, modalidade_id) VALUES (?, ?)', ['B', futId]);
      const grupoB = gb.insertId;
      for (const sigla of ['NESA', 'UNIR', 'FESO', 'UFOA']) {
        await conn.query('INSERT IGNORE INTO grupos_times (grupo_id, time_id) VALUES (?, ?)', [grupoB, timeMap[sigla]]);
      }

      // Grupo de Futsal
      const fsId = modMap['Futsal'];
      const [gfs] = await conn.query('INSERT INTO grupos (nome, modalidade_id) VALUES (?, ?)', ['A', fsId]);
      const grupoFS = gfs.insertId;
      for (const sigla of ['UERJ', 'UFF', 'UFRJ', 'PUC']) {
        await conn.query('INSERT IGNORE INTO grupos_times (grupo_id, time_id) VALUES (?, ?)', [grupoFS, timeMap[sigla]]);
      }

      console.log('✅ Grupos criados: Futebol (A, B) + Futsal (A)');

      // ── Jogos de exemplo ─────────────────────────────────────────
      const now = new Date();
      const hora = (h, m = 0) => {
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        return d.toISOString().slice(0, 19).replace('T', ' ');
      };

      const jogos = [
        // Futebol Grupo A — encerrados
        { mod: futId, grupo: grupoA, fase: 'grupos', casa: 'UERJ', vis: 'UFF',  gc: 2, gv: 1, status: 'encerrado', data: hora(8, 0),  local: 'Campo Principal' },
        { mod: futId, grupo: grupoA, fase: 'grupos', casa: 'UFRJ', vis: 'PUC',  gc: 0, gv: 0, status: 'encerrado', data: hora(9, 0),  local: 'Campo Principal' },
        { mod: futId, grupo: grupoA, fase: 'grupos', casa: 'UERJ', vis: 'UFRJ', gc: 1, gv: 1, status: 'encerrado', data: hora(10, 0), local: 'Campo Principal' },
        // Futebol Grupo A — ao vivo
        { mod: futId, grupo: grupoA, fase: 'grupos', casa: 'UFF',  vis: 'PUC',  gc: 1, gv: 2, status: 'ao_vivo',   data: hora(11, 0), local: 'Campo Principal' },
        // Futebol Grupo B — agendados
        { mod: futId, grupo: grupoB, fase: 'grupos', casa: 'NESA', vis: 'UNIR', gc: 0, gv: 0, status: 'agendado',  data: hora(13, 0), local: 'Campo Secundário' },
        { mod: futId, grupo: grupoB, fase: 'grupos', casa: 'FESO', vis: 'UFOA', gc: 0, gv: 0, status: 'agendado',  data: hora(14, 0), local: 'Campo Secundário' },
        // Futsal
        { mod: fsId,  grupo: grupoFS,fase: 'grupos', casa: 'UERJ', vis: 'UFF',  gc: 3, gv: 2, status: 'encerrado', data: hora(8, 30), local: 'Ginásio' },
        { mod: fsId,  grupo: grupoFS,fase: 'grupos', casa: 'UFRJ', vis: 'PUC',  gc: 0, gv: 0, status: 'agendado',  data: hora(15, 0), local: 'Ginásio' },
        // Mata-mata (semifinal futebol, exemplo)
        { mod: futId, grupo: null, fase: 'semifinal', casa: 'UERJ', vis: 'NESA', gc: 0, gv: 0, status: 'agendado', data: hora(16, 0), local: 'Campo Principal' },
      ];

      for (const j of jogos) {
        const [res] = await conn.query(
          `INSERT INTO jogos (modalidade_id, grupo_id, fase, time_casa_id, time_visitante_id,
            gols_casa, gols_visitante, status, data_jogo, local_jogo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [j.mod, j.grupo, j.fase, timeMap[j.casa], timeMap[j.vis],
           j.gc, j.gv, j.status, j.data, j.local]
        );

        // Atualizar classificação para jogos encerrados em grupos
        if (j.status === 'encerrado' && j.grupo && j.fase === 'grupos') {
          const casaId = timeMap[j.casa];
          const visId  = timeMap[j.vis];
          const gc = j.gc, gv = j.gv;
          const casaVence = gc > gv, visVence = gv > gc, empate = gc === gv;

          await conn.query(`
            INSERT INTO grupos_times (grupo_id, time_id, pontos, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, saldo_gols)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              pontos=pontos+VALUES(pontos), jogos=jogos+1,
              vitorias=vitorias+VALUES(vitorias), empates=empates+VALUES(empates), derrotas=derrotas+VALUES(derrotas),
              gols_pro=gols_pro+VALUES(gols_pro), gols_contra=gols_contra+VALUES(gols_contra), saldo_gols=saldo_gols+VALUES(saldo_gols)
          `, [j.grupo, casaId, casaVence?3:empate?1:0, casaVence?1:0, empate?1:0, visVence?1:0, gc, gv, gc-gv]);

          await conn.query(`
            INSERT INTO grupos_times (grupo_id, time_id, pontos, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, saldo_gols)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              pontos=pontos+VALUES(pontos), jogos=jogos+1,
              vitorias=vitorias+VALUES(vitorias), empates=empates+VALUES(empates), derrotas=derrotas+VALUES(derrotas),
              gols_pro=gols_pro+VALUES(gols_pro), gols_contra=gols_contra+VALUES(gols_contra), saldo_gols=saldo_gols+VALUES(saldo_gols)
          `, [j.grupo, visId, visVence?3:empate?1:0, visVence?1:0, empate?1:0, casaVence?1:0, gv, gc, gv-gc]);
        }
      }

      console.log(`✅ ${jogos.length} jogos criados com placares e classificação`);
    } else {
      console.log('⏭  Grupos/jogos já existem, pulando...');
    }

    console.log('\n🎉 Seed concluído com sucesso!\n');
    console.log('   Acesse: http://localhost:3001');
    console.log('   Admin:  http://localhost:3001/login.html');
    console.log('   Login:  admin@copa.med / admin123\n');

  } catch (err) {
    console.error('❌ Erro no seed:', err.message);
  } finally {
    conn.release();
    process.exit(0);
  }
}

seed();
