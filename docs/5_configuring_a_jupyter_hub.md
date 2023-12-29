# Configuring a JupyterHub

**TL;DR:** This page details the process of setting up a JupyterHub, including creating a configuration file, building the necessary Azure infrastructure, and deploying the Hub on Kubernetes. It also discusses running examples that interact with the JupyterHub API, demonstrating the project's full capabilities.

## 5.1 Configuration

Jupyter has [great documentation on configuring a Jupyter hub](https://z2jh.jupyter.org/en/latest/jupyterhub/customizing/user-environment.html), regardless, in this document I will outline a more summarized version of the steps including some additional steps.

The first step to creating our hub is to create a configuration file that defines some of our customizations for the hub. See the `config.yaml` file in the root of the project for an annotated example.

The first thing we need to configure is to define the name of a secret that we will create containing the necessary credentials to allow the hub to pull images from our Azure Container Registry. We simply need to define a name for it for now. We will create this secret using this name in the next section.

Secondly, we want to configure our external service or api that will interact with our hub. We can define a name for the service, whether or not it should be an administrative service, and an api token that we will use to authenticate with the service. For now, we can hardcode the token as the value for `api_token`.

```shell
# Generate a random token for this example.
openssl rand -hex 32
```

## 5.2 Creating the infrastructure

Please see [the JupyterHub documentation](https://z2jh.jupyter.org/en/latest/kubernetes/microsoft/step-zero-azure.html) for a more in-depth guide on deploying a K8s cluster to your cloud provider of choice. Again, I will outline the steps I took here as there were some extra steps like setting up the ACR correctly, adding our Blob Store and remembering to add your IP to the NSG that are not outlined in the JupyterHub docs.

For some of the following sets of commands, pay attention to quoting of the parameter values, this is required in some shells like `zsh`.

```shell
# Login to Azure
az login --tenant <your-tenant-id>

# Set our subscription
az account set --subscription <your-subscription-id>

# Create a resource group to house our ACR and AKS cluster
az group create --name <my-rg-name> --location eastus

# Create our ACR
az acr create --resource-group <my-rg-name> --name <myacrname> --sku Basic

# Login to our ACR
az acr login --name <myacrname>

# Push our custom single-user image to our ACR
docker push <myacrname>.azurecr.io/singleuser:3.2.1

# Create a VNET and SUBNET for our AKS cluster
az network vnet create \
   --resource-group <my-rg-name> \
   --name <my-vnet-name> \
   --address-prefixes 10.0.0.0/8 \
   --subnet-name <my-subnet-name> \
   --subnet-prefix 10.240.0.0/16

# Store our NSG name in a variable for later use.
NSG_NAME=$(
  az resource show \
    --ids "$(
      az network vnet subnet show \
        --resource-group <my-rg-name> \
        --vnet-name <my-vnet-name> \
        --name <my-subnet-name> \
        --query "networkSecurityGroup.id" -o tsv
    )" \
    --query name -o tsv
)

# Add our IP to the Network Security group to allow us to access our HTTP/HTTPS JupyterHub instance.
az network nsg rule create --resource-group <my-rg-name> \
   --nsg-name <my-nsg-name> \
   --name "AllowMyIPHttpInbound" \
   --priority 200 \
   --source-address-prefixes "$(curl ifconfig.me)" \
   --destination-port-ranges 80 \
   --access Allow \
   --protocol TCP \
   --description "Allow my IP"
az network nsg rule create --resource-group <my-rg-name> \
   --nsg-name <my-nsg-name> \
   --name "AllowMyIPHttpsInbound" \
   --priority 100 \
   --source-address-prefixes "$(curl ifconfig.me)" \
   --destination-port-ranges 443 \
   --access Allow \
   --protocol TCP \
   --description "Allow my IP"

# Store our VNET ID in a variable for later use.
VNET_ID=$(az network vnet show \
   --resource-group <my-rg-name> \
   --name <my-vnet-name> \
   --query id \
   --output tsv)

# Store our SUBNET ID in a variable for later use.
SUBNET_ID=$(az network vnet subnet show \
   --resource-group <my-rg-name> \
   --vnet-name <my-vnet-name> \
   --name <my-snet-name> \
   --query id \
   --output tsv)

# Create a storage account for our blob store
az storage account create \
  --name <my-storage-account-name> \
  --resource-group <my-rg-name> \
  --location eastus \
  --sku Standard_LRS \
  --kind StorageV2 \
  --default-action Deny \
  --hns true \
  --enable-nfs-v3 true \
  --vnet-name <my-vnet-name> \
  --subnet <my-snet-name>

# Add our IP to the storage account network rules
az storage account network-rule add \
  --resource-group <my-rg-name> \
  --account-name <my-storage-account-name> \
  --ip-address $(curl ifconfig.me)

# Create a storage container for user data
az storage container create \
  --name users \
  --account-name <my-storage-account-name>

# Create an AAD (Azure AD) service principal for use with the cluster, assigning the Contributor role for use with the VNet, and store the password in a variable.
SP_PASSWD=$(az ad sp create-for-rbac \
   --name <my-sp-name> \
   --role Contributor \
   --scopes $VNET_ID \
   --query password \
   --output tsv)

# Store our service principal ID in a variable for later use.
SP_ID=$(az ad app list \
   --filter "displayname eq '<my-sp-name>'" \
   --query "[0].appId" \
   --output tsv)

# Give our SP permissions to pull containers from our ACR.
az role assignment create \
  --assignee $SP_ID \
  --role "AcrPull" \
  --scope /subscriptions/<my-subscription-id>/resourcegroups/<my-rg-name>/providers/Microsoft.ContainerRegistry/registries/<acr>

#Give our SP storage blob data contributor permissions to our storage account.
az role assignment create \
  --assignee $SP_ID \
  --role "Storage Blob Data Contributor" \
  --scope /subscriptions/<my-subscription-id>/resourceGroups/<my-rg-name>/providers/Microsoft.Storage/storageAccounts/<storage-account-name>

# Generate a public and private SSH key to secure the nodes in our cluster.
ssh-keygen -f my-ssh-key-name

# Create our AKS cluster
az aks create \
   --name my-aks-name \
   --resource-group <my-rg-name> \
   --ssh-key-value my-ssh-key-name.pub \
   --node-count 3 \
   --node-vm-size Standard_D2s_v3 \
   --service-principal $SP_ID \
   --client-secret $SP_PASSWD \
   --dns-service-ip 10.0.0.10 \
   --docker-bridge-address 172.17.0.1/16 \
   --network-plugin azure \
   --network-policy azure \
   --service-cidr 10.0.0.0/16 \
   --vnet-subnet-id $SUBNET_ID \
   --vm-set-type VirtualMachineScaleSets \
   --enable-cluster-autoscaler \
   --min-count 3 \
   --max-count 6 \
   --enable-blob-driver \
   --output table

# Install kubectl
az aks install-cli

# Get our AKS credentials
az aks get-credentials \
   --name my-aks-name \
   --resource-group <my-rg-name> \
   --output table

# Check if our cluster is fully functional
kubectl get node

# Next, we need to make a change to the blob driver to enable fsGroupPolicy.
# https://github.com/kubernetes-sigs/blob-csi-driver/blob/ce26f284065e1f9d68f3e3ca4046515aa17e8d3f/deploy/example/fsgroup/README.md
# Backup Blob driver
kubectl get csidriver blob.csi.azure.com -o yaml > blob.csi.azure.com_backup.yaml
# Delete Blob driver
kubectl delete CSIDriver blob.csi.azure.com
# Recreate Driver with fsGroupPolicy.
cat <<EOF | kubectl create -f -
apiVersion: storage.k8s.io/v1
kind: CSIDriver
metadata:
  name: blob.csi.azure.com
spec:
  attachRequired: false
  podInfoOnMount: true
  fsGroupPolicy: File
  volumeLifecycleModes:
    - Persistent
    - Ephemeral
EOF
# Validate changes.
kubectl get csidriver blob.csi.azure.com -o yaml
# Debugging https://github.com/kubernetes-sigs/blob-csi-driver/blob/ce26f284065e1f9d68f3e3ca4046515aa17e8d3f/docs/csi-debug.md
```

## 5.3 Deploying JupyterHub

[Install helm](https://helm.sh/docs/intro/install/)

```shell
cd packages/jupyterhub

# Acquire and install helm.
curl https://raw.githubusercontent.com/helm/helm/HEAD/scripts/get-helm-3 | bash

# Check installation
helm version

# Add the JupyterHub helm repo
helm repo add jupyterhub https://hub.jupyter.org/helm-chart/

# Update the helm repo
helm repo update

# Install the JupyterHub helm chart.
helm upgrade --cleanup-on-fail \
  --install <my-release-name> jupyterhub/jupyterhub \
  --namespace <my-aks-name> \
  --create-namespace \
  --version=3.1.0 \
  --values config.yaml

# Set our AKS context as default
kubectl config use-context <my-aks-name>

# Create our image pulling credentials
kubectl create secret docker-registry azure-container-registry \
   --docker-server=<myacrname>.azurecr.io \
   --docker-username=$SP_ID \
   --docker-password=$SP_PASSWD

# Check our secrets
kubectl get secrets

# Ensure our pods are running.
kubectl get pod

#If you see any pods in a CrashLoopBackOff state, for example, an image puller, check the logs for the pod.
kubectl logs <hook-image-puller-...> -n <my-aks-name> -c image-pull-singleuser

# If you see an error like: exec /bin/sh: exec format error, ensure that your container architecture matches that required by the K8s cluster.
kubectl get nodes -o=jsonpath='{.items[*].status.nodeInfo.architecture}'
docker inspect <myacrname>.azurecr.io/singleuser:3.2.1 | grep Architecture

# Find the public IP of our proxy to access our hub
kubectl get service proxy-public
```

If you lose your `config.yaml`, you can use `helm list -A` to see all the helm releases in your cluster and `helm get values [RELEASE_NAME] --revision [REVISION_NUMBER]` to get the configuration values for a specific release.

## 5.4 Configuring storage:

You can read more about Persistent Volumes in the [Kubernetes Docs](https://kubernetes.io/docs/concepts/storage/persistent-volumes/). First, modify the Persistent Volume file `azure-blob-nfs-pv.yaml` to include your storage account details. Then, you can modify the storage per user in the claim, if needed. Finally, apply the PV and PVC.

```shell
# Apply our Storage Class
kubectl apply -f azure-blob-nfs-sc.yaml

# Apply our Persistent Volume
kubectl apply -f azure-blob-nfs-pv.yaml

# Apply our Persistent Volume Claim
kubectl apply -f azure-blob-nfs-pvc.yaml
```

Next, we will need to configure and deploy our custom hub image, which contains a custom spawner that mounts the correct path of the storage volume to the user's pod. It retrieves the conversationId from spawn requests to construct this path and mounts the correct path.

For this, we just need to build and push our custom image to our ACR.

```shell
# Login to our ACR
az acr login --name <myacrname>

# Build and push our custom image
docker buildx build --platform=linux/amd64 --tag <myacrname>.azurecr.io/k8s-hub:3.2.1 --push -f ./Dockerfile.k8s-hub .

# Restart the hub to pull the latest image.
kubectl delete pod hub-...
```

At this point, you can manually start a single user server (using the test script in `scripts/`) to test your configuration, or continue to the next section to run the hub example.

```shell
# Create a user and start their singleuser server for testing.
./scripts/create_user_start_server.sh <URL> <TOKEN> <USERNAME> <CONVERSATION_ID>
```

## 5.5 Running the hub example

Similar to running the Jupyter Server example, running the JupyterHub example requires setting the appropriate environment variables. Create a `.env` file in the 'examples' package with the relevant values. See the `example.env` file for an example.

To run the example, you can use the `launch.json` configurations by pressing F5 or play in VSCode. Or you can simply run the relevant package script: `pnpm run start:hub`.

You should now be able to interact with the assistant. The assistant will be aware of a langchain `Tool` that interacts with the [JupyterHub API](https://jupyterhub.readthedocs.io/en/stable/reference/rest-api.html#/) directly to start a single-user server session, execute code on the Jupyter Server and save that along with results to a notebook.

```shell
You: Execute some code that creates a plot with translucent circles of varying colors.
Starting WebSocket: ws://127.0.0.1:8888/api/kernels/e06fc983-4b30-4b8e-a08a-a265e9bd0787
Assistant: Here is a plot with translucent circles of varying colors.
```

![Colorful Translucent Circles](../assets/generated_example.png)

At this point, again, I recommend you refer to the annotated code in `src/hub_tool_example.ts`, `src/tools/HubCodeInterpreter.ts` and `src/utils/jupyterHubUtils.ts` to understand more of the details.

[Previous: Configuring a Jupyter Server](./4_configuring_a_jupyter_server.md) | [Next: Conclusion](./6_conclusion.md)  
[Table of Contents](../README.md#table-of-contents)

## 5.6 Managing user servers

> [jupyterhub-idle-culler](https://github.com/jupyterhub/jupyterhub-idle-culler) provides a JupyterHub service to identify and stop idle or long-running Jupyter servers via JupyterHub. It works solely by interacting with JupyterHub's REST API, and is often configured to run as a JupyterHub managed service started up by JupyterHub itself.

You can check if the jupyterhub-idle-culler service is running by running the following commands:

```shell
# Get running pods, note the hub pod name.
kubectl get pods
# Get the logs of the hub pod
kubectl logs hub-...
```

You will be able to see messages like the following:

```shell
[I 2023-12-12 17:52:35.508 JupyterHub app:3189] Starting managed service jupyterhub-idle-culler-service
[I 2023-12-12 17:52:35.508 JupyterHub service:385] Starting service 'jupyterhub-idle-culler-service': ['python3', '-m', 'jupyterhub_idle_culler', '--timeout=3600', '--cull-users', '--api-page-size=200']

# And eventually, when it culls a single-user server...
[I 231213 03:52:36 __init__:362] Culling user fran (inactive for 1:09:58.216145)
```
