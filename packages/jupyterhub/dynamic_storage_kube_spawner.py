import os
from kubespawner import KubeSpawner


class DynamicStorageKubeSpawner(KubeSpawner):
    """
    Custom KubeSpawner class with dynamic storage provisioning for NFS mounts.

    This class extends KubeSpawner and adds functionality for dynamically provisioning
    storage for NFS mounts in Kubernetes while adhering to user and conversation-centric pathing.

    Args:
        KubeSpawner: The base KubeSpawner class to extend.

    Attributes:
        None

    Methods:
        get_pvc_manifest(): Retrieve the Persistent Volume Claim (PVC) manifest.
        _update_volume(volume_name, pvc_name): Update the volume configuration.
        _update_volume_mount(volume_name, expected_mount_path, sub_path): Update the volume mount configuration.
        _add_init_container(volume_name, mount_path, sub_path): Add an initContainer for NFS mounts.
    """

    def get_pvc_manifest(self):
        """
        Retrieve the Persistent Volume Claim (PVC) manifest.

        This method extracts user-specific details, defines volume and PVC names,
        updates the PVC name, and adds an initContainer for permission adjustment.

        Returns:
            dict: The PVC manifest.

        Example usage:
            pvc_manifest = self.get_pvc_manifest()
        """

        # Extract user-specific details
        user_id = self.user.name
        conversation_id = self.user_options.get("conversationId", "new")

        # Define volume and PVC names
        volume_name = f"volume-{user_id}-{conversation_id}"
        pvc_name = f"claim-{user_id}-{conversation_id}"
        sub_path = f"{user_id}/conversations/{conversation_id}"
        home_mount_path = os.environ.get("HOME", "/home/jovyan")

        # Update the PVC name
        self.pvc_name = pvc_name

        # Update the volume in the volumes list
        self._update_volume(volume_name, pvc_name)

        # Update the volume mount in the volume mounts list
        self._update_volume_mount(volume_name, home_mount_path, sub_path)

        # Add init container for permission adjustment
        self._add_init_container(volume_name, home_mount_path, sub_path)

        return super().get_pvc_manifest()

    def _update_volume(self, volume_name, pvc_name):
        """
        Update the volume configuration.

        This method updates the volume configuration based on the provided volume_name
        and PVC name (pvc_name).

        Args:
            volume_name (str): The name of the volume to be updated.
            pvc_name (str): The name of the associated Persistent Volume Claim (PVC).

        Returns:
            None
        """

        expected_volume_names = [
            self._expand_user_properties("volume-{username}{servername}"),
            "volume-{username}{servername}",
        ]

        volume = next(
            (v for v in self.volumes if v.get("name") in expected_volume_names),
            None,
        )
        if volume:
            volume.update(
                {"name": volume_name, "persistentVolumeClaim": {"claimName": pvc_name}}
            )
        else:
            existing_volume_names = [v.get("name") for v in self.volumes]
            self.log.warning(
                f"No volume found matching {expected_volume_names}. Existing volumes: {existing_volume_names}"
            )

    def _update_volume_mount(self, volume_name, expected_mount_path, sub_path):
        """
        Update the volume mount configuration.

        This method updates the volume mount configuration based on the provided volume_name,
        expected_mount_path, and sub_path.

        Args:
            volume_name (str): The name of the volume to be mounted.
            expected_mount_path (str): The expected mount path within the container.
            sub_path (str): The sub-path within the volume.

        Returns:
            None
        """

        mount = next(
            (
                m
                for m in self.volume_mounts
                if m.get("mountPath") == expected_mount_path
            ),
            None,
        )
        if mount:
            mount.update({"name": volume_name, "subPath": sub_path})
        else:
            existing_mount_paths = [m.get("mountPath") for m in self.volume_mounts]
            self.log.warning(
                f"No volume mount found for {expected_mount_path}. Existing mounts: {existing_mount_paths}"
            )

    def _add_init_container(self, volume_name, mount_path, sub_path):
        """
        Add an initContainer configuration for NFS mounts in Kubernetes.

        The use of an initContainer here is due to NFS's lack of automatic UID/GID handling.
        NFS mounts in K8s don't automatically match the user and group IDs of the container,
        often resulting in permission issues. An initContainer running as root can adjust permissions on the NFS mount
        to match the expected user IDs, resolving these issues. This approach allows the main container to continue
        running as a non-root user, maintaining security best practices by limiting root access to only the initContainer
        which performs necessary setup tasks before the main application starts.

        Args:
            volume_name (str): The name of the volume to be mounted.
            mount_path (str): The mount path within the container.
            sub_path (str): The sub-path within the volume.

        Returns:
            None

        Example usage:
            _add_init_container("my-volume", "/mnt/data", "sub/folder")
        """

        init_container_command = f"""
            permissions_to_set=1000:100
            mount_path={mount_path}

            # Check if permissions_to_set and mount_path are provided
            if [ -z "$permissions_to_set" ] || [ -z "$mount_path" ]; then
                echo "Usage Error: <user:group> </mount/path>. Exiting."
                exit 1
            fi

            permissions_to_set=1000:100

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

            # Check current permissions
            current_permissions=$(stat -c "%u:%g" "$mount_path")
            echo "Current permissions for $mount_path: $current_permissions"
            if [ "$current_permissions" = "$permissions_to_set" ]; then
                echo "Permissions are already correctly set. Exiting successfully."
                exit 0
            fi

            # Update permissions and verify
            echo "Changing permissions for $mount_path..."
            chown -R $permissions_to_set "$mount_path"
            updated_permissions=$(stat -c "%u:%g" "$mount_path")
            echo "Updated permissions for $mount_path: $updated_permissions"
            if [ "$updated_permissions" = "$permissions_to_set" ]; then
                echo "Permissions updated successfully."
            else
                echo "Failed to set permissions. Exiting with error."
                exit 1
            fi
        """
        self.init_containers.append(
            {
                "name": "init-nfs",
                "image": "busybox",
                "command": ["sh", "-c", init_container_command],
                "securityContext": {"runAsUser": 0},
                "volumeMounts": [
                    {"name": volume_name, "mountPath": mount_path, "subPath": sub_path}
                ],
            }
        )
