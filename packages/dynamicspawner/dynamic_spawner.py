#!/usr/bin/env python
from functools import partial
from traitlets import List, Unicode
from kubernetes_asyncio.client.models import (
    V1Pod,
    V1CSIPersistentVolumeSource,
    V1SecretReference,
)
from jupyterhub.utils import exponential_backoff
from kubespawner import KubeSpawner
from kubespawner.objects import make_pvc


class DynamicSpawner(KubeSpawner):
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

    sc_names = List(
        trait=Unicode(),
        default_value=[],
        config=True,
        help="List of Storage Class names.",
    )
    pvc_templates = List(
        trait=Unicode(), default_value=[], config=True, help="List of PVC templates."
    )
    volume_names = List(
        trait=Unicode(), default_value=[], config=True, help="List of volume names."
    )

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.modify_pod_hook = modify_pod_hook

    @property
    def conversation_id(self):
        return self.user_options.get("conversationId", "new")

    def _expand_user_properties(self, template):
        """
        Extend the base class method to include custom properties like 'conversationId'.
        """
        custom_properties = ["conversation_id"]
        for custom_property in custom_properties:
            template = template.replace(f"{{{custom_property}}}", custom_property)

        template = super()._expand_user_properties(template)

        for custom_property in custom_properties:
            property_value = getattr(self, custom_property, f"{{custom_property}}")
            template = template.replace(custom_property, str(property_value))

        return template


async def modify_pod_hook(spawner: DynamicSpawner, pod: V1Pod):
    if (
        hasattr(spawner, "sc_names")
        and hasattr(spawner, "pvc_templates")
        and hasattr(spawner, "volume_names")
        and len(spawner.sc_names)
        == len(spawner.pvc_templates)
        == len(spawner.volume_names)
    ):
        for idx in range(len(spawner.pvc_templates)):
            sc_name = spawner.sc_names[idx]
            pvc_template = spawner.pvc_templates[idx]
            volume_name = spawner.volume_names[idx]

            pvc_name = pvc_template.format(username=spawner.user.name)

            await configure_additional_nfs_volume(
                spawner, pod, sc_name, pvc_name, volume_name
            )

    return pod


async def configure_additional_nfs_volume(
    spawner: DynamicSpawner,
    pod: V1Pod,
    sc_name: str,
    pvc_name: str,
    volume_name: str,
):
    pvc = make_pvc(
        name=pvc_name,
        storage_class=sc_name,
        access_modes=spawner.storage_access_modes,
        selector=spawner._expand_all(spawner.storage_selector),
        storage=spawner.storage_capacity,
        labels=spawner._build_common_labels(
            spawner._expand_all(spawner.storage_extra_labels)
        ),
        annotations=spawner._build_common_annotations(
            spawner._expand_all(spawner.storage_extra_annotations)
        ),
    )

    pvc.spec.csi = V1CSIPersistentVolumeSource(
        driver="blob.csi.azure.com",
        volume_handle=f"stgptresearch002_{spawner.user.name}",
        node_stage_secret_ref=V1SecretReference(
            name="azure-storage-secret", namespace="aks-jupyterhub-dev-eastus-001"
        ),
    )

    spawner.log.debug(f"Attempting to create PVC {pvc_name}")
    try:
        await exponential_backoff(
            partial(
                spawner._make_create_pvc_request,
                pvc,
                spawner.k8s_api_request_timeout,
            ),
            f"Could not create PVC {pvc_name}",
            timeout=spawner.k8s_api_request_retry_timeout,
        )
        spawner.log.info(f"Successfully created PVC {pvc_name}")
    except Exception as e:
        spawner.log.error(f"Failed to create PVC {pvc_name}: {e}")
