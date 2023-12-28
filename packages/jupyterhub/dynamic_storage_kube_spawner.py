from kubespawner import KubeSpawner


class DynamicStorageKubeSpawner(KubeSpawner):
    def start(self):
        userId = self.user.name
        conversationId = self.user_options.get("conversationId", "new")

        # Append the Azure Blob volume to the existing volumes
        self.volumes.append(
            {
                "name": "azure-blob-volume",  # Unique name for the Azure Blob volume
                "persistentVolumeClaim": {"claimName": "azure-blob-nfs-pvc"},
            }
        )

        # Append the Azure Blob volume mount to the existing volume mounts
        self.volume_mounts.append(
            {
                "mountPath": "/mnt/data",  # Mount path for the Azure Blob volume
                "name": "azure-blob-volume",  # Must match the name in the volumes list
                "subPath": f"{userId}/conversations/{conversationId}",
            }
        )

        return super().start()
