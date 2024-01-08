#!/bin/sh

mount_path=${MOUNT_PATH}
mount_owner=${MOUNT_OWNER}
mount_mode=${MOUNT_MODE}

if [ -z "$mount_path" ] || [ -z "$mount_owner" ] || [ -z "$mount_mode" ]; then
  echo "Usage: missing MOUNT_PATH (e.g. \"/mnt/data\"), MOUNT_OWNER (e.g. \"1000:100\"), or MOUNT_MODE (e.g. \"2770\") Environment variables. Using defaults."
  mount_path="/mnt/data"
  mount_owner="1000:100"
  mount_mode="2770"
fi

echo "Checking user identity..."
if [ "$(id -u)" != "0" ]; then
  id
  echo "Error: not running as root. Exiting."
  exit 1
fi
echo "Running as root."

echo "Checking mounted volume..."
if ! mountpoint -q "$mount_path"; then
  df -h
  echo "Error: $mount_path is not a mountpoint. Exiting."
  exit 1
fi
echo "Volume is mounted."

current_owner=$(stat -c "%u:%g" "$mount_path")
echo "Current owner for $mount_path: $current_owner"
if [ "$current_owner" = "$mount_owner" ]; then
  echo "Owner already correctly set. Continuing."
else
  echo "Changing owner for $mount_path..."
  chown -R "$mount_owner" "$mount_path"
fi

current_mode=$(stat -c "%a" "$mount_path")
echo "Current mode for $mount_path: $current_mode"
if [ "$current_mode" = "$mount_mode" ]; then
  echo "Mode already correctly set. Continuing."
else
  echo "Changing mode for $mount_path..."
  chmod -R "$mount_mode" "$mount_path"
fi

set_owner=0
new_owner=$(stat -c "%u:%g" "$mount_path")
echo "New owner for $mount_path: $new_owner"
if [ "$new_owner" = "$mount_owner" ]; then
  echo "Owner updated successfully."
  set_owner=1
else
  echo "Failed to set owner."
fi

set_mode=0
new_mode=$(stat -c "%a" "$mount_path")
echo "New mode for $mount_path: $new_mode"
if [ "$new_mode" = "$mount_mode" ]; then
  echo "Mode updated successfully."
  set_mode=1
else
  echo "Failed to set mode."
fi

if [ "$set_owner" -eq 0 ] || [ "$set_mode" -eq 0 ]; then
  echo "Exiting with error."
  exit 1
fi
