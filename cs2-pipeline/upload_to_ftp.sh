#!/bin/bash

# Ensure script stops on error
set -e

if [ -z "$1" ]; then
    echo "Usage: ./upload_to_ftp.sh <path_to_file>"
    exit 1
fi

LOCAL_FILE="$1"
FILENAME=$(basename "$LOCAL_FILE")

FTP_HOST="ftp://baroque.dathost.net:21"
FTP_USER="67fd3fd5caae0fdc8408ff64"
FTP_PASS="iyoGJKy0aEQ"

# Assuming you want to put these custom skins somewhere standard for your server.
# Modify this path if the server requires a different structure for custom assets.
REMOTE_DIR="/csgo/materials/models/weapons/custom"

echo "[FTP] Uploading $LOCAL_FILE to $FTP_HOST$REMOTE_DIR/$FILENAME..."

# Using curl with --ftp-create-dirs to automatically create the folder structure if it doesn't exist
curl -u "$FTP_USER:$FTP_PASS" -T "$LOCAL_FILE" "$FTP_HOST$REMOTE_DIR/$FILENAME" --ftp-create-dirs

echo "[FTP] Successfully uploaded $FILENAME"
