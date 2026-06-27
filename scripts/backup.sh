#!/usr/bin/env bash
# ─── MySQL Backup Script ─────────────────────────────────────────
# Runs inside the MySQL container. Cron on the host calls this.
# Usage from host: docker exec medvene_db /backups/backup.sh
# Or add to crontab: 0 2 * * * docker exec medvene_db /backups/backup.sh
set -euo pipefail

BACKUP_DIR="/backups"
DB_NAME="${MYSQL_DATABASE:-medvene}"
DB_USER="${MYSQL_USER:-medvene}"
DB_PASSWORD="${MYSQL_PASSWORD:?MYSQL_PASSWORD not set}"
MAX_BACKUPS=7  # Keep 7 days of backups

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Backing up ${DB_NAME} → ${FILENAME}"

mysqldump \
  -u "$DB_USER" \
  -p"$DB_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" | gzip > "$FILENAME"

echo "[$(date)] Backup complete: $(du -sh "$FILENAME" | cut -f1)"

# Rotate old backups
BACKUPS_KEPT=$(ls -1 "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | wc -l)
if [ "$BACKUPS_KEPT" -gt "$MAX_BACKUPS" ]; then
  ls -1t "$BACKUP_DIR"/${DB_NAME}_*.sql.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f
  echo "[$(date)] Rotated: kept $MAX_BACKUPS, removed $((BACKUPS_KEPT - MAX_BACKUPS)) old backups"
fi