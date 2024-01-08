#!/bin/ash

mount_path=${MOUNT_PATH:-"/mnt/store"}
mount_owner=${MOUNT_OWNER:-"0:100"}
mount_mode=${MOUNT_MODE:-"0700"}

# Check if mount_mode and mount_path are provided
if [ -z "$mount_path" ] || [ -z "$mount_owner" ] || [ -z "$mount_mode" ]; then
    echo "Usage Error: <mount_path (e.g. /mnt/store)> <mount_owner (e.g. 0:100)> <mount_mode (e.g. 0700)>. Exiting."
    exit 1
fi

# Check and print the current user identity
echo "Checking user identity..."
if [ "$(id -u)" != "0" ]; then
    id
    echo "Error: not running as root. Exiting."
    exit 1
fi
echo "Running as root."

# Check the mounted volume
echo "Checking mounted volume..."
if ! mountpoint -q "$mount_path"; then
    df -h
    echo "Error: $mount_path is not a mountpoint. Exiting."
    exit 1
fi
echo "Volume is mounted."

# Check current owner
current_owner=$(stat -c "%u:%g" "$mount_path")
echo "Current owner for $mount_path: $current_owner"
if [ "$current_owner" = "$mount_owner" ]; then
    echo "Owner already correctly set. Continuing."
else
    echo "Changing owner for $mount_path..."
    chown -R $mount_owner "$mount_path"
fi

# Check current mode
current_mode=$(stat -c "%a" "$mount_path")
echo "Current mode for $mount_path: $current_mode"
if [ "$current_mode" = "$mount_mode" ]; then
    echo "Mode already correctly set. Continuing."
else
    echo "Changing mode for $mount_path..."
    chmod -R $mount_mode "$mount_path"
fi

set_owner=0
current_owner=$(stat -c "%u:%g" "$mount_path")
if [ "$current_owner" = "$mount_owner" ]; then
    echo "Owner updated successfully."
    set_owner=1
else
    echo "Failed to set owner."
fi

set_mode=0
current_mode=$(stat -c "%a" "$mount_path")
if [ "$current_mode" = "$mount_mode" ]; then
    echo "Mode updated successfully."
    set_mode=1
else
    echo "Failed to set mode."
fi

# Check the success flag to determine the final exit status
if [ "$set_owner" -eq 0 ] || [ "$set_mode" -eq 0 ]; then
    echo "Exiting with error."
    exit 1
fi
