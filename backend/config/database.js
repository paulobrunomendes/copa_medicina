const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'copa_medicina',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS modalidades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        icone VARCHAR(50) DEFAULT '⚽',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS times (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        sigla VARCHAR(10) NOT NULL,
        cor VARCHAR(7) DEFAULT '#1a73e8',
        curso VARCHAR(100),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS grupos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(50) NOT NULL,
        modalidade_id INT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS grupos_times (
        id INT AUTO_INCREMENT PRIMARY KEY,
        grupo_id INT NOT NULL,
        time_id INT NOT NULL,
        pontos INT DEFAULT 0,
        jogos INT DEFAULT 0,
        vitorias INT DEFAULT 0,
        empates INT DEFAULT 0,
        derrotas INT DEFAULT 0,
        gols_pro INT DEFAULT 0,
        gols_contra INT DEFAULT 0,
        saldo_gols INT DEFAULT 0,
        FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE CASCADE,
        FOREIGN KEY (time_id) REFERENCES times(id) ON DELETE CASCADE,
        UNIQUE KEY unique_grupo_time (grupo_id, time_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS jogos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        modalidade_id INT NOT NULL,
        grupo_id INT,
        fase ENUM('grupos','oitavas','quartas','semifinal','terceiro_lugar','final') DEFAULT 'grupos',
        time_casa_id INT NOT NULL,
        time_visitante_id INT NOT NULL,
        gols_casa INT DEFAULT 0,
        gols_visitante INT DEFAULT 0,
        status ENUM('agendado','ao_vivo','encerrado') DEFAULT 'agendado',
        data_jogo DATETIME,
        local_jogo VARCHAR(200),
        observacoes TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (modalidade_id) REFERENCES modalidades(id),
        FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE SET NULL,
        FOREIGN KEY (time_casa_id) REFERENCES times(id),
        FOREIGN KEY (time_visitante_id) REFERENCES times(id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        senha VARCHAR(255) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Adicionar coluna logo se não existir (MySQL 8.0 compatível)
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'times' AND COLUMN_NAME = 'logo'`
    );
    if (cols.length === 0) {
      await conn.query('ALTER TABLE times ADD COLUMN logo VARCHAR(255) DEFAULT NULL');
    }

    // Adicionar colunas de timer ao jogos (MySQL 8.0 compatível)
    const timerCols = [
      { name: 'duracao_periodo', sql: 'ALTER TABLE jogos ADD COLUMN duracao_periodo INT DEFAULT 45' },
      { name: 'num_periodos',    sql: 'ALTER TABLE jogos ADD COLUMN num_periodos TINYINT DEFAULT 2' },
      { name: 'periodo_atual',   sql: 'ALTER TABLE jogos ADD COLUMN periodo_atual TINYINT DEFAULT 0' },
      { name: 'timer_inicio',    sql: 'ALTER TABLE jogos ADD COLUMN timer_inicio BIGINT NULL' },
      { name: 'timer_decorrido', sql: 'ALTER TABLE jogos ADD COLUMN timer_decorrido INT DEFAULT 0' },
      { name: 'timer_ativo',     sql: 'ALTER TABLE jogos ADD COLUMN timer_ativo TINYINT(1) DEFAULT 0' },
    ];
    for (const col of timerCols) {
      const [existing] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jogos' AND COLUMN_NAME = ?`,
        [col.name]
      );
      if (existing.length === 0) await conn.query(col.sql);
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS gols (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jogo_id INT NOT NULL,
        time_id INT NOT NULL,
        jogador VARCHAR(100) NOT NULL,
        minuto INT DEFAULT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
        FOREIGN KEY (time_id) REFERENCES times(id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS cartoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jogo_id INT NOT NULL,
        time_id INT NOT NULL,
        jogador VARCHAR(100) NOT NULL,
        tipo ENUM('amarelo','vermelho') NOT NULL DEFAULT 'amarelo',
        minuto INT DEFAULT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
        FOREIGN KEY (time_id) REFERENCES times(id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS parceiros (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        logo VARCHAR(255) DEFAULT NULL,
        categoria VARCHAR(50) DEFAULT '',
        beneficio VARCHAR(200) DEFAULT '',
        descricao TEXT,
        contato VARCHAR(100) DEFAULT '',
        whatsapp VARCHAR(20) DEFAULT '',
        site VARCHAR(200) DEFAULT '',
        ativo TINYINT(1) DEFAULT 1,
        ordem INT DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        descricao TEXT,
        preco DECIMAL(10,2) DEFAULT NULL,
        foto VARCHAR(255) DEFAULT NULL,
        whatsapp_msg TEXT,
        whatsapp VARCHAR(20) DEFAULT '',
        ativo TINYINT(1) DEFAULT 1,
        ordem INT DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS noticias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(200) NOT NULL,
        conteudo TEXT,
        imagem VARCHAR(255) DEFAULT NULL,
        tag VARCHAR(50) DEFAULT '',
        fixado TINYINT(1) DEFAULT 0,
        ativo TINYINT(1) DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_endpoint (endpoint(500))
      )
    `);

    // Inserir modalidades padrão se não existirem
    const [mods] = await conn.query('SELECT COUNT(*) as total FROM modalidades');
    if (mods[0].total === 0) {
      await conn.query(`
        INSERT INTO modalidades (nome, icone) VALUES
        ('Futebol', '⚽'),
        ('Futsal', '🥅'),
        ('Vôlei', '🏐'),
        ('Basquete', '🏀'),
        ('Outros', '🏆')
      `);
    }

    // Adicionar colunas de pênaltis/prorrogação ao jogos
    const penaltiCols = [
      { name: 'gols_prorrogacao_casa',      sql: 'ALTER TABLE jogos ADD COLUMN gols_prorrogacao_casa INT DEFAULT 0' },
      { name: 'gols_prorrogacao_visitante', sql: 'ALTER TABLE jogos ADD COLUMN gols_prorrogacao_visitante INT DEFAULT 0' },
      { name: 'gols_penaltis_casa',         sql: 'ALTER TABLE jogos ADD COLUMN gols_penaltis_casa INT DEFAULT 0' },
      { name: 'gols_penaltis_visitante',    sql: 'ALTER TABLE jogos ADD COLUMN gols_penaltis_visitante INT DEFAULT 0' },
    ];
    for (const col of penaltiCols) {
      const [existing] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jogos' AND COLUMN_NAME = ?`,
        [col.name]
      );
      if (existing.length === 0) await conn.query(col.sql);
    }

    // Adicionar coluna periodo em gols e cartoes
    for (const { table, col } of [
      { table: 'gols',    col: 'periodo' },
      { table: 'cartoes', col: 'periodo' },
    ]) {
      const [ex] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, col]
      );
      if (ex.length === 0) await conn.query(`ALTER TABLE ${table} ADD COLUMN periodo TINYINT DEFAULT NULL`);
    }

    // Colunas de MVP no jogos
    for (const { name, sql } of [
      { name: 'mvp_jogador', sql: "ALTER TABLE jogos ADD COLUMN mvp_jogador VARCHAR(100) DEFAULT NULL" },
      { name: 'mvp_time_id', sql: "ALTER TABLE jogos ADD COLUMN mvp_time_id INT DEFAULT NULL" },
    ]) {
      const [ex] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='jogos' AND COLUMN_NAME=?`, [name]
      );
      if (ex.length === 0) await conn.query(sql);
    }

    // Novas tabelas: configuracoes, parciais, auditoria_jogos
    await conn.query(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        chave VARCHAR(100) PRIMARY KEY,
        valor LONGTEXT,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS parciais (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jogo_id INT NOT NULL,
        numero TINYINT NOT NULL,
        label VARCHAR(20) DEFAULT NULL,
        gols_casa INT DEFAULT 0,
        gols_visitante INT DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS auditoria_jogos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jogo_id INT NOT NULL,
        admin_nome VARCHAR(100),
        acao VARCHAR(100) NOT NULL,
        detalhe TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE
      )
    `);

    // Adicionar coluna tipo em modalidades (basquete usa sistema diferente)
    const [tipoCol] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modalidades' AND COLUMN_NAME = 'tipo'`
    );
    if (tipoCol.length === 0) {
      await conn.query(`ALTER TABLE modalidades ADD COLUMN tipo VARCHAR(30) DEFAULT 'padrao'`);
      await conn.query(`UPDATE modalidades SET tipo='basquete' WHERE nome LIKE '%asquet%'`);
    }

    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao inicializar banco:', err);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDB };
