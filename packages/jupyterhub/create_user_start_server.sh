#!/bin/bash

if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]; then
  echo "Usage: $0 <URL> <TOKEN> <USERNAME> <CONVERSATION_ID> <CONNECT>"
  exit 1
fi

DOMAIN=$1
TOKEN=$2
USERNAME=$3
CONVERSATION_ID=$4
CONNECT=$5

echo "Creating user: $USERNAME"
curl -X POST $DOMAIN/hub/api/users/$USERNAME \
     -H "Authorization: token $TOKEN" \
     -H "Content-Type: application/json"
echo ""

echo "Starting server for user: $USERNAME"
curl -X POST $DOMAIN/hub/api/users/$USERNAME/server \
     -H "Authorization: token $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{ \"conversationId\": \"$CONVERSATION_ID\" }"
echo ""

echo "Timing the progress of the server for user: $USERNAME"
start_time=$(date +%s)

curl -N -H "Authorization: token $TOKEN" $DOMAIN/hub/api/users/$USERNAME/server/progress

end_time=$(date +%s)
duration=$((end_time - start_time))
echo "Connection was open for $duration seconds."

if [ -n "$CONNECT" ]; then
  echo "Enumerating mounts..."
  kubectl exec -it "jupyter-$USERNAME" -- df -h

  echo "Listing identity..."
  kubectl exec -it "jupyter-$USERNAME" -- id

  echo "Connecting to $USERNAME's server..."
  kubectl exec -it "jupyter-$USERNAME" -- /bin/bash
fi
