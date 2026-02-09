#!/bin/bash
set -e

echo "============================================"
echo "  Bom Flow CRM - Server Setup Script"
echo "============================================"

APP_DIR="/opt/bomflow"
DB_NAME="bomflow"
DB_USER="auth_bd"
DB_PASS="4uth@1307BD"
DB_PASS_ENCODED="4uth%401307BD"

echo ""
echo "[1/6] Criando diretórios..."
sudo mkdir -p ${APP_DIR}/uploads
sudo chown -R ${USER}:${USER} ${APP_DIR}
cp docker-compose.yml ${APP_DIR}/docker-compose.yml
cp .env.example ${APP_DIR}/.env.example
echo "  -> ${APP_DIR} criado com sucesso."

echo ""
echo "[2/6] Configurando banco de dados PostgreSQL..."
echo "  -> Criando banco '${DB_NAME}' e usuário '${DB_USER}'..."
sudo -u postgres psql <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF

sudo -u postgres psql -d ${DB_NAME} <<EOF
GRANT ALL ON SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
EOF
echo "  -> Banco e permissões configurados."

echo ""
echo "[3/6] Verificando pg_hba.conf para acesso Docker..."
PG_HBA=$(sudo find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1)
if [ -n "$PG_HBA" ]; then
  if ! sudo grep -q "172.17.0.0/16" "$PG_HBA"; then
    echo "  -> Adicionando regra Docker ao pg_hba.conf..."
    echo "host    ${DB_NAME}    ${DB_USER}    172.17.0.0/16    md5" | sudo tee -a "$PG_HBA" > /dev/null
    sudo systemctl restart postgresql
    echo "  -> pg_hba.conf atualizado e PostgreSQL reiniciado."
  else
    echo "  -> Regra Docker já existe no pg_hba.conf."
  fi
else
  echo "  -> AVISO: pg_hba.conf não encontrado. Configure manualmente."
fi

echo ""
echo "[4/6] Criando arquivo .env..."
cat > ${APP_DIR}/.env <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS_ENCODED}@172.17.0.1:5432/${DB_NAME}
JWT_SECRET=2Iz5EHu2ZKRnebbtxV+R/e1JcPxjX/zcF68Xt5q/mXo=
SESSION_SECRET=2Iz5EHu2ZKRnebbtxV+R/e1JcPxjX/zcF68Xt5q/mXo=
EOF
chmod 600 ${APP_DIR}/.env
echo "  -> .env criado em ${APP_DIR}/.env"

echo ""
echo "[5/6] Login no GitHub Container Registry..."
echo "  -> Insira seu GitHub PAT quando solicitado:"
docker login ghcr.io -u devs-wescctech
echo "  -> Login realizado."

echo ""
echo "[6/6] Baixando imagem e iniciando container..."
cd ${APP_DIR}
docker compose pull
docker compose up -d
echo "  -> Container app-bomflow iniciado."

echo ""
echo "Verificando status..."
sleep 10
if docker ps --filter "name=app-bomflow" --filter "status=running" | grep -q app-bomflow; then
  echo "  -> Container rodando com sucesso!"
  echo "  -> Acesse: http://$(hostname -I | awk '{print $1}'):5200"
else
  echo "  -> AVISO: Container pode não ter iniciado corretamente."
  echo "  -> Verifique com: docker logs app-bomflow"
fi

echo ""
echo "============================================"
echo "  Setup concluído!"
echo "============================================"
