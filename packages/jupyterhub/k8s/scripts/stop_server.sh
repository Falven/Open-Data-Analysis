#!/bin/bash

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <URL> <TOKEN> <USERNAME>"
  exit 1
fi

DOMAIN=$1
TOKEN=$2
USERNAME=$3

echo "Stopping server"
curl -X DELETE $DOMAIN/hub/api/users/$USERNAME/server \
     -H "Authorization: token $TOKEN"
echo ""
