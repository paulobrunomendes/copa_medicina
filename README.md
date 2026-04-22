# 🏆 Copa Regional de Medicina — App de Placares

App web completo para gerenciar e exibir placares da Copa Regional de Medicina.
Suporta múltiplas modalidades, fase de grupos + mata-mata e atualização de placares ao vivo.

---

## 📦 Estrutura do Projeto

```
copa-medicina/
├── setup.sh                      # Script de instalação automática
├── nginx.conf.example            # Configuração Nginx para produção
├── README.md
├── backend/
│   ├── config/
│   │   └── database.js           # Conexão MySQL e criação das tabelas
│   ├── middleware/
│   │   └── auth.js               # Autenticação JWT
│   ├── routes/
│   │   ├── auth.js               # Login e cadastro de admin
│   │   ├── jogos.js              # CRUD de jogos + atualização de placar
│   │   ├── times.js              # CRUD de times
│   │   ├── grupos.js             # CRUD de grupos e classificação
│   │   └── modalidades.js        # CRUD de modalidades
│   ├── server.js                 # Servidor principal + Socket.IO
│   ├── seed.js                   # Dados de exemplo para teste
│   ├── package.json
│   └── .env.example              # Modelo de variáveis de ambiente
└── frontend/
    ├── index.html                # Página pública de placares
    ├── login.html                # Login do admin
    ├── jogo.html                 # Página individual do jogo (ao vivo)
    ├── admin/
    │   └── index.html            # Painel administrativo completo
    └── public/
        ├── css/style.css         # Estilos globais
        └── js/app.js             # Utilitários e cliente da API
```

---

## 🚀 Como Instalar e Rodar

### Pré-requisitos
- Node.js 18+ instalado
- MySQL 8+ instalado e rodando
- npm ou yarn

### 1. Criar o banco de dados MySQL

Abra o MySQL e execute:
```sql
CREATE DATABASE copa_medicina CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Configurar variáveis de ambiente

```bash
cd backend
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:
```
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha_do_mysql
DB_NAME=copa_medicina
JWT_SECRET=uma_string_aleatoria_e_longa_aqui
FRONTEND_URL=http://localhost:3001
```

### 3. Instalar dependências

```bash
cd backend
npm install
```

### 4. Iniciar o servidor

```bash
npm start
```

Para desenvolvimento com auto-reload:
```bash
npm run dev
```

### 5. Acessar o app

| Página | URL |
|--------|-----|
| 🏆 Placares públicos | http://localhost:3001 |
| 🔐 Login admin | http://localhost:3001/login.html |
| ⚙️ Painel admin | http://localhost:3001/admin/ |

---

## 🎯 Primeiro Acesso

1. Acesse http://localhost:3001/login.html
2. Como é o **primeiro acesso**, vai aparecer o formulário de criação do admin principal
3. Preencha nome, email e senha
4. Pronto! Você será redirecionado ao painel

---

## 📋 Fluxo de Uso Recomendado

### 1. Cadastrar Times
- Painel → Times → Novo Time
- Informe nome, sigla (ex: UERJ), cor e curso/instituição

### 2. Criar Grupos (fase de grupos)
- Painel → Grupos → Novo Grupo
- Selecione a modalidade e dê um nome (A, B, C...)
- Adicione os times ao grupo

### 3. Cadastrar Jogos
- Painel → Gerenciar Jogos → Novo Jogo
- Selecione modalidade, fase, times, data e local
- Para jogos de grupos, vincule ao grupo correto

### 4. Controlar Placar ao Vivo
- Painel → Placar ao Vivo
- Selecione o jogo
- Clique em **"Iniciar / Ao Vivo"** para começar
- Use os botões + e − para ajustar os gols
- Clique **"Salvar Placar"** para enviar para todos os espectadores em tempo real
- Ao final, clique **"Encerrar Jogo"** (a classificação é atualizada automaticamente)

---

## ⚙️ Funcionalidades

### Área Pública
- ✅ Jogos ao vivo, agendados e encerrados
- ✅ Filtro por modalidade
- ✅ Tabela de classificação dos grupos
- ✅ Chaveamento (mata-mata) por fase
- ✅ Banner de "Ao Vivo" quando há jogos acontecendo
- ✅ Atualização em tempo real via WebSocket

### Área Admin
- ✅ Login seguro com JWT
- ✅ Controle de placar ao vivo (+/-)
- ✅ Iniciar / Encerrar jogo com um clique
- ✅ CRUD completo de times, grupos, jogos e modalidades
- ✅ Classificação calculada automaticamente ao encerrar jogos de grupos

---

## 🔧 Deploy em Produção

### Opções recomendadas

**Railway** (mais fácil):
1. Crie conta em railway.app
2. New Project → Deploy from GitHub
3. Adicione um MySQL plugin
4. Configure as variáveis de ambiente
5. Deploy automático!

**VPS (DigitalOcean, Hostinger, etc)**:
```bash
# Instalar PM2 para manter o servidor rodando
npm install -g pm2
pm2 start backend/server.js --name copa-medicina
pm2 startup
pm2 save
```

Configure Nginx para servir na porta 80:
```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🏅 Modalidades Padrão

O sistema já vem com as seguintes modalidades criadas:
- ⚽ Futebol
- 🥅 Futsal
- 🏐 Vôlei
- 🏀 Basquete
- 🏆 Outros

---

## 🛠 Tecnologias

| Camada | Tecnologia |
|--------|------------|
| Backend | Node.js + Express |
| Banco de dados | MySQL 8 |
| Autenticação | JWT + bcrypt |
| Tempo real | Socket.IO (WebSocket) |
| Frontend | HTML + CSS + JS puro |
| Fontes | Google Fonts (Inter) |
