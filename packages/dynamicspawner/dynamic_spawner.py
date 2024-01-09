#!/usr/bin/env python
import sys
import copy
from functools import partial
from traitlets import Dict, List
import asyncio
from kubernetes_asyncio.client.models import (
    V1Pod,
    V1ObjectMeta,
    V1PersistentVolumeClaim,
    V1PersistentVolumeClaimSpec,
    V1ResourceRequirements,
    V1PersistentVolume,
    V1PersistentVolumeSpec,
    V1CSIPersistentVolumeSource,
    V1SecretReference,
)
from kubernetes_asyncio.client.rest import ApiException
from jupyterhub.utils import exponential_backoff
from kubespawner import KubeSpawner


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

    additional_pvs = List(
        trait=Dict(),
        default_value=[],
        config=True,
        help="Additional PVs to create dynamically.",
    )
    additional_pvcs = List(
        trait=Dict(),
        default_value=[],
        config=True,
        help="Additional PVCs to create dynamically.",
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

    async def _make_create_pv_request(self, pv, request_timeout):
        # Try and create the pv. If it succeeds we are good. If
        # returns a 409 indicating it already exists we are good. If
        # it returns a 403, indicating potential quota issue we need
        # to see if pv already exists before we decide to raise the
        # error for quota being exceeded. This is because quota is
        # checked before determining if the PV needed to be
        # created.
        pv_name = pv.metadata.name
        try:
            self.log.info(
                f"Attempting to create pv {pv_name}, with timeout {request_timeout}"
            )
            await asyncio.wait_for(
                self.api.create_persistent_volume(
                    body=pv,
                ),
                request_timeout,
            )
            return True
        except asyncio.TimeoutError:
            # Just try again
            return False
        except ApiException as e:
            if e.status == 409:
                self.log.info(
                    "PV " + pv_name + " already exists, so did not create new pv."
                )
                return True
            elif e.status == 403:
                t, v, tb = sys.exc_info()

                try:
                    await self.api.read_persistent_volume(pv_name)
                except ApiException:
                    raise v.with_traceback(tb)

                self.log.info(
                    "PV "
                    + self.pv_name
                    + " already exists, possibly have reached quota though."
                )
                return True
            else:
                raise


async def modify_pod_hook(spawner: DynamicSpawner, pod: V1Pod):
    try:
        spawner.log.info("Attempting to configure additional PVs and PVCs.")
        if hasattr(spawner, "additional_pvs"):
            for pv in spawner.additional_pvs:
                await make_additional_pv(spawner, pv)

        if hasattr(spawner, "additional_pvcs"):
            for pvc in spawner.additional_pvcs:
                await make_additional_pvc(spawner, pvc)
    except Exception as e:
        spawner.log.error(f"Failed to configure additional PVs and PVcs: {e}")
    finally:
        return pod


async def make_additional_pvc(
    spawner: DynamicSpawner,
    additional_pvc,
):
    """
    Dynamically create an additional PVC based on provided configuration.
    """
    # Deep copy the configuration to avoid mutating the original object
    pvc_config = copy.deepcopy(additional_pvc)

    # Expand and set default values for metadata and spec
    metadata = pvc_config.get("metadata", None)
    if metadata:
        pvc_name = metadata.get("name", None)
        if pvc_name:
            pvc_name = metadata["name"] = spawner._expand_user_properties(pvc_name)

        metadata["labels"] = {
            **spawner._build_common_labels(
                spawner._expand_all(spawner.storage_extra_labels)
            ),
            **metadata.get("labels", {}),
        }

        metadata["annotations"] = {
            **spawner._build_common_annotations(
                spawner._expand_all(spawner.storage_extra_annotations)
            ),
            **metadata.get("annotations", {}),
        }

        pvc_config["metadata"] = metadata

    spec = pvc_config.get("spec", None)
    if spec:
        volume_name = spec.get("volume_name", None)
        if volume_name:
            volume_name = spec["volume_name"] = spawner._expand_user_properties(
                volume_name
            )

        storage_class_name = spec.get("storage_class_name", None)
        if storage_class_name:
            spec["storage_class_name"] = spawner._expand_user_properties(
                storage_class_name
            )

        selector = spec.get("selector", None)
        if selector:
            spec["selector"] = {
                **spawner._expand_all(spawner.storage_selector),
                **selector,
            }

        pvc_config["spec"] = spec

    # Create and configure the PVC
    pvc = make_pvc(**pvc_config)

    try:
        spawner.log.info(f"Creating PVC: {pvc}")
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


async def make_additional_pv(
    spawner: DynamicSpawner,
    additional_pv,
):
    """
    Dynamically create an additional PV based on provided configuration.
    """
    # Deep copy the configuration to avoid mutating the original object
    pv_config = copy.deepcopy(additional_pv)

    metadata = pv_config.get("metadata", None)
    if metadata:
        pv_name = metadata.get("name", None)
        if pv_name:
            pv_name = metadata["name"] = spawner._expand_user_properties(pv_name)

        metadata["labels"] = {
            **spawner._build_common_labels(
                spawner._expand_all(spawner.storage_extra_labels)
            ),
            **metadata.get("labels", {}),
        }

        metadata["annotations"] = {
            **spawner._build_common_annotations(
                spawner._expand_all(spawner.storage_extra_annotations)
            ),
            **metadata.get("annotations", {}),
        }

        pv_config["metadata"] = metadata

    spec = pv_config.get("spec", None)
    if spec:
        storage_class_name = spec.get("storage_class_name", None)
        if storage_class_name:
            spec["storage_class_name"] = spawner._expand_user_properties(
                storage_class_name
            )

        csi = spec.get("csi", None)
        if csi:
            volume_handle = csi.get("volume_handle", None)
            if volume_handle:
                csi["volume_handle"] = spawner._expand_user_properties(volume_handle)

            volume_attributes = csi.get("volume_attributes", None)
            if volume_attributes:
                container_name = volume_attributes.get("containerName", None)

                if container_name:
                    volume_attributes[
                        "containerName"
                    ] = spawner._expand_user_properties(container_name)

                csi["volume_attributes"] = volume_attributes

            spec["csi"] = csi

        pv_config["spec"] = spec

    # Create and configure the PV
    pv = make_pv(**pv_config)

    try:
        spawner.log.info(f"Creating PV with config: {pv_config}")
        spawner.log.info(f"PV class: {pv}")
        await exponential_backoff(
            partial(
                spawner._make_create_pv_request,
                pv,
                spawner.k8s_api_request_timeout,
            ),
            f"Could not create PV {pv_name}",
            timeout=spawner.k8s_api_request_retry_timeout,
        )
        spawner.log.info(f"Successfully created PV {pv_name}")
    except Exception as e:
        spawner.log.error(f"Failed to create PV {pv_name}: {e}")


def make_pvc(
    metadata=None,
    spec=None,
):
    """
    Make a k8s pvc specification for running a user notebook.
    """
    pvc = V1PersistentVolumeClaim()
    pvc.kind = "PersistentVolumeClaim"
    pvc.api_version = "v1"

    if metadata:
        pvc.metadata = V1ObjectMeta(**metadata)

    if spec:
        pvc.spec = V1PersistentVolumeClaimSpec(**spec)

        resources = spec.get("resources", None)
        if resources:
            pvc.spec.resources = V1ResourceRequirements(**resources)

        storage_class_name = spec.get("storage_class_name", None)
        if storage_class_name:
            pvc.metadata.annotations.update(
                {"volume.beta.kubernetes.io/storage-class": storage_class_name}
            )

    return pvc


def make_pv(
    metadata=None,
    spec=None,
):
    """
    Make a k8s pv specification for running a user notebook.
    """
    pv = V1PersistentVolume()
    pv.api_version = "v1"
    pv.kind = "PersistentVolume"

    if metadata:
        pv.metadata = V1ObjectMeta(**metadata)

    if spec:
        pv.spec = V1PersistentVolumeSpec(**spec)

        csi = spec.get("csi", None)
        if csi:
            pv.spec.csi = V1CSIPersistentVolumeSource(**csi)

            node_stage_secret_ref = csi.get("node_stage_secret_ref", None)
            if node_stage_secret_ref:
                pv.spec.csi.node_stage_secret_ref = V1SecretReference(
                    **node_stage_secret_ref
                )

    return pv
