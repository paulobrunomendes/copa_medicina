#!/bin/bash
# ============================================================
#  setup.sh — Configuração rápida da Copa Medicina
#  Execute: chmod +x setup.sh && ./setup.sh
# ============================================================

set -e

echo ""
echo "🏆 Copa Regional de Medicina — Setup"
echo "====================================="
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale em: https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 18+ é necessário. Versão atual: $(node -v)"
  exit 1
fi

echo "✅ Node.js $(node -v)"

# Verificar MySQL
if ! command -v mysql &> /dev/null; then
  echo "⚠️  mysql CLI não encontrado. Certifique-se de que o MySQL está instalado e rodando."
fi

# Instalar dependências
echo ""
echo "📦 Instalando dependências..."
cd backend
npm install

# Configurar .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "📝 Arquivo .env criado. Edite com suas configurações de banco de dados:"
  echo ""
  echo "   DB_HOST=localhost"
  echo "   DB_USER=root"
  echo "   DB_PASSWORD=sua_senha"
  echo "   DB_NAME=copa_medicina"
  echo "   JWT_SECRET=uma_chave_secreta_longa"
  echo ""
  echo "   Abra: backend/.env"
  echo ""
  read -p "Pressione ENTER quando terminar de editar o .env..."
fi

# Criar banco de dados
echo ""
read -p "🗄  Criar banco de dados agora? (s/n): " CRIAR_BD
if [[ "$CRIAR_BD" == "s" || "$CRIAR_BD" == "S" ]]; then
  read -p "   Usuário MySQL (padrão: root): " DB_USER
  DB_USER=${DB_USER:-root}
  read -sp "   Senha MySQL: " DB_PASS
  echo ""
  mysql -u "$DB_USER" -p"$DB_PASS" -e "CREATE DATABASE IF NOT EXISTS copa_medicina CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
  echo "   ✅ Banco de dados 'copa_medicina' criado!"
fi

echo ""
echo "🌱 Deseja carregar dados de exemplo? (times, grupos e jogos para teste)"
read -p "   (s/n): " SEED
if [[ "$SEED" == "s" || "$SEED" == "S" ]]; then
  node seed.js
fi

echo ""
echo "🚀 Iniciando servidor..."
echo ""
echo "   Acesse: http://localhost:3001"
echo "   Admin:  http://localhost:3001/login.html"
echo ""

npm start
