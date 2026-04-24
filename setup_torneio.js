const http = require('http');

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001,
      path: `/api${path}`, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  // 1. Login
  const loginRes = await api('POST', '/auth/login', { email: 'admin@teste.com', senha: 'admin123' });
  if (!loginRes.data.token) { console.error('Login falhou:', loginRes.data); process.exit(1); }
  const token = loginRes.data.token;
  const post = (path, body) => api('POST', path, body, token);
  const get  = (path)       => api('GET',  path, null,  token);
  console.log('✅ Login ok\n');

  // 2. Modalidades
  const modsExist = (await get('/modalidades')).data;
  const modalidades = {};
  const modsNecessarias = [
    { key: 'futsal_m',    nome: 'Futsal Masculino',   icone: '🥅', tipo: 'padrao'   },
    { key: 'futsal_f',    nome: 'Futsal Feminino',    icone: '🥅', tipo: 'padrao'   },
    { key: 'basquete_m',  nome: 'Basquete Masculino', icone: '🏀', tipo: 'basquete' },
    { key: 'basquete_f',  nome: 'Basquete Feminino',  icone: '🏀', tipo: 'basquete' },
    { key: 'volei_m',     nome: 'Vôlei Masculino',    icone: '🏐', tipo: 'padrao'   },
    { key: 'volei_f',     nome: 'Vôlei Feminino',     icone: '🏐', tipo: 'padrao'   },
    { key: 'handebol',    nome: 'Handebol',            icone: '🤾', tipo: 'padrao'   },
  ];
  for (const m of modsNecessarias) {
    const ex = modsExist.find(e => e.nome === m.nome);
    if (ex) { modalidades[m.key] = ex.id; console.log(`  MOD já existe: ${m.nome} (id=${ex.id})`); }
    else {
      const r = await post('/modalidades', { nome: m.nome, icone: m.icone, tipo: m.tipo });
      modalidades[m.key] = r.data.id;
      console.log(`  MOD criada: ${m.nome} (id=${r.data.id})`);
    }
  }

  // 3. Times
  const timesExist = (await get('/times')).data;
  const times = {};
  const timesNecessarios = [
    { key: 'fmc',      nome: 'FMC',      sigla: 'FMC', cor: '#e74c3c' },
    { key: 'faminas',  nome: 'FAMINAS',  sigla: 'FAM', cor: '#3498db' },
    { key: 'redentor', nome: 'REDENTOR', sigla: 'RED', cor: '#2ecc71' },
    { key: 'famesc',   nome: 'FAMESC',   sigla: 'FSC', cor: '#f39c12' },
    { key: 'ufrj',     nome: 'UFRJ',     sigla: 'UFR', cor: '#9b59b6' },
    { key: 'unig',     nome: 'UNIG',     sigla: 'UNI', cor: '#1abc9c' },
  ];
  console.log('');
  for (const t of timesNecessarios) {
    const ex = timesExist.find(e => e.sigla === t.sigla || e.nome === t.nome);
    if (ex) { times[t.key] = ex.id; console.log(`  TIME já existe: ${t.nome} (id=${ex.id})`); }
    else {
      const r = await post('/times', { nome: t.nome, sigla: t.sigla, cor: t.cor });
      times[t.key] = r.data.id;
      console.log(`  TIME criado: ${t.nome} (id=${r.data.id})`);
    }
  }

  // 4. Grupos + times
  const grupos = {};
  const gruposNecessarios = [
    { key: 'futsal_m_a',  nome: 'Grupo A', mod: 'futsal_m',   times: ['fmc','faminas','redentor'] },
    { key: 'futsal_m_b',  nome: 'Grupo B', mod: 'futsal_m',   times: ['famesc','ufrj','unig'] },
    { key: 'handebol_a',  nome: 'Grupo A', mod: 'handebol',   times: ['famesc','ufrj','redentor'] },
    { key: 'handebol_b',  nome: 'Grupo B', mod: 'handebol',   times: ['fmc','faminas','unig'] },
    { key: 'volei_m_a',   nome: 'Grupo A', mod: 'volei_m',    times: ['redentor','fmc','famesc'] },
    { key: 'volei_m_b',   nome: 'Grupo B', mod: 'volei_m',    times: ['faminas','ufrj','unig'] },
    { key: 'basquete_f_a',nome: 'Grupo A', mod: 'basquete_f', times: ['unig','ufrj','faminas'] },
  ];
  console.log('');
  for (const g of gruposNecessarios) {
    const r = await post('/grupos', { nome: g.nome, modalidade_id: modalidades[g.mod] });
    grupos[g.key] = r.data.id;
    console.log(`  GRUPO criado: ${g.nome} (${g.mod}) id=${r.data.id}`);
    for (const tk of g.times) {
      await post(`/grupos/${r.data.id}/times`, { time_id: times[tk] });
    }
    console.log(`    Times: ${g.times.join(', ')}`);
  }

  // 5. Jogos
  const D1 = '2026-04-24';
  const D2 = '2026-04-25';
  const jogos = [
    // ─── FUTSAL MASCULINO — grupos — Dia 1 ANACLETO ───
    { mod:'futsal_m', fase:'grupos', grp:'futsal_m_a', c:'fmc',     v:'faminas',  dt:`${D1}T08:00:00`, loc:'Anacleto' },
    { mod:'futsal_m', fase:'grupos', grp:'futsal_m_b', c:'famesc',  v:'ufrj',     dt:`${D1}T09:00:00`, loc:'Anacleto' },
    { mod:'futsal_m', fase:'grupos', grp:'futsal_m_a', c:'fmc',     v:'redentor', dt:`${D1}T11:00:00`, loc:'Anacleto' },
    { mod:'futsal_m', fase:'grupos', grp:'futsal_m_b', c:'famesc',  v:'unig',     dt:`${D1}T12:00:00`, loc:'Anacleto' },
    { mod:'futsal_m', fase:'grupos', grp:'futsal_m_a', c:'faminas', v:'redentor', dt:`${D1}T14:00:00`, loc:'Anacleto' },
    { mod:'futsal_m', fase:'grupos', grp:'futsal_m_b', c:'ufrj',    v:'unig',     dt:`${D1}T15:00:00`, loc:'Anacleto' },

    // ─── FUTSAL FEMININO — quartas — Dia 1 ANACLETO ───
    { mod:'futsal_f', fase:'quartas', grp:null, c:'ufrj',  v:'redentor', dt:`${D1}T10:00:00`, loc:'Anacleto' },
    { mod:'futsal_f', fase:'quartas', grp:null, c:'unig',  v:'famesc',   dt:`${D1}T13:00:00`, loc:'Anacleto' },

    // ─── HANDEBOL — grupos — Dia 1 ANACLETO ───
    { mod:'handebol', fase:'grupos', grp:'handebol_a', c:'famesc', v:'ufrj',     dt:`${D1}T18:00:00`, loc:'Anacleto' },
    { mod:'handebol', fase:'grupos', grp:'handebol_b', c:'fmc',    v:'faminas',  dt:`${D1}T19:00:00`, loc:'Anacleto' },
    { mod:'handebol', fase:'grupos', grp:'handebol_a', c:'famesc', v:'redentor', dt:`${D1}T20:00:00`, loc:'Anacleto' },
    { mod:'handebol', fase:'grupos', grp:'handebol_b', c:'fmc',    v:'unig',     dt:`${D1}T21:00:00`, loc:'Anacleto' },

    // ─── BASQUETE MASCULINO — quartas — Dia 1 PADRE MELO ───
    { mod:'basquete_m', fase:'quartas', grp:null, c:'fmc',    v:'redentor', dt:`${D1}T08:00:00`, loc:'Padre Melo' },
    { mod:'basquete_m', fase:'quartas', grp:null, c:'faminas',v:'ufrj',     dt:`${D1}T12:00:00`, loc:'Padre Melo' },

    // ─── BASQUETE FEMININO — grupos — Dia 1 PADRE MELO ───
    { mod:'basquete_f', fase:'grupos', grp:'basquete_f_a', c:'unig', v:'ufrj',    dt:`${D1}T09:00:00`, loc:'Padre Melo' },
    { mod:'basquete_f', fase:'grupos', grp:'basquete_f_a', c:'unig', v:'faminas', dt:`${D1}T11:00:00`, loc:'Padre Melo' },
    { mod:'basquete_f', fase:'grupos', grp:'basquete_f_a', c:'ufrj', v:'faminas', dt:`${D1}T13:00:00`, loc:'Padre Melo' },

    // ─── VÔLEI MASCULINO — grupos — Dia 1 PADRE MELO ───
    { mod:'volei_m', fase:'grupos', grp:'volei_m_a', c:'redentor', v:'famesc', dt:`${D1}T16:00:00`, loc:'Padre Melo' },
    { mod:'volei_m', fase:'grupos', grp:'volei_m_b', c:'faminas',  v:'ufrj',   dt:`${D1}T17:00:00`, loc:'Padre Melo' },
    { mod:'volei_m', fase:'grupos', grp:'volei_m_a', c:'redentor', v:'fmc',    dt:`${D1}T18:00:00`, loc:'Padre Melo' },

    // ─── VÔLEI FEMININO — semifinal — Dia 1 PADRE MELO ───
    { mod:'volei_f', fase:'semifinal', grp:null, c:'ufrj',  v:'redentor', dt:`${D1}T19:00:00`, loc:'Padre Melo' },

    // ─── HANDEBOL — grupos — Dia 2 ANACLETO ───
    { mod:'handebol', fase:'grupos', grp:'handebol_a', c:'ufrj',    v:'redentor', dt:`${D2}T09:00:00`, loc:'Anacleto' },
    { mod:'handebol', fase:'grupos', grp:'handebol_b', c:'faminas', v:'unig',     dt:`${D2}T10:00:00`, loc:'Anacleto' },

    // ─── VÔLEI MASCULINO — grupos — Dia 2 PADRE MELO ───
    { mod:'volei_m', fase:'grupos', grp:'volei_m_b', c:'faminas', v:'unig',   dt:`${D2}T09:00:00`, loc:'Padre Melo' },
    { mod:'volei_m', fase:'grupos', grp:'volei_m_a', c:'fmc',     v:'famesc', dt:`${D2}T11:00:00`, loc:'Padre Melo' },
    { mod:'volei_m', fase:'grupos', grp:'volei_m_b', c:'ufrj',    v:'unig',   dt:`${D2}T12:00:00`, loc:'Padre Melo' },

    // ─── VÔLEI FEMININO — semifinal — Dia 2 PADRE MELO ───
    { mod:'volei_f', fase:'semifinal', grp:null, c:'famesc', v:'faminas', dt:`${D2}T10:00:00`, loc:'Padre Melo' },
  ];

  console.log('');
  let erros = 0;
  for (const j of jogos) {
    const body = {
      modalidade_id:      modalidades[j.mod],
      fase:               j.fase,
      grupo_id:           j.grp ? grupos[j.grp] : null,
      time_casa_id:       times[j.c],
      time_visitante_id:  times[j.v],
      data_jogo:          j.dt,
      local_jogo:         j.loc,
    };
    const r = await post('/jogos', body);
    if (r.data && r.data.id) {
      console.log(`  JOGO: ${j.c.toUpperCase()} x ${j.v.toUpperCase()} | ${j.mod} | ${j.fase} | ${j.loc}`);
    } else {
      console.error(`  ❌ Erro: ${j.c} x ${j.v}`, r.data);
      erros++;
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Setup concluído! ${jogos.length - erros}/${jogos.length} jogos criados.`);
  if (erros) console.log(`❌ ${erros} erro(s) — verifique acima.`);
}

main().catch(console.error);
