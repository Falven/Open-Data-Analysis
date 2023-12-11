# Configuring a JupyterHub

**TL;DR:** This page details the process of setting up a JupyterHub, including creating a configuration file, building the necessary Azure infrastructure, and deploying the Hub on Kubernetes. It also discusses running examples that interact with the JupyterHub API, demonstrating the project's full capabilities.

## 5.1 Configuration

Jupyter has [great documentation on configuring a Jupyter hub](https://z2jh.jupyter.org/en/latest/jupyterhub/customizing/user-environment.html), regardless I will outline a more summarized version of the steps I took in this document for your benefit.

The first step to creating our hub is to create a configuration file that defines some of our customizations for the hub. See the `config.yaml` file in the root of the project for an example.

```yaml
# This file can update the JupyterHub Helm chart's default configuration values.
#
# For reference see the configuration reference and default values, but make
# sure to refer to the Helm chart version of interest to you!
#
# Introduction to YAML:     https://www.youtube.com/watch?v=cdLNKUoMc6c
# Chart config reference:   https://zero-to-jupyterhub.readthedocs.io/en/stable/resources/reference.html
# Chart default values:     https://github.com/jupyterhub/zero-to-jupyterhub-k8s/blob/HEAD/jupyterhub/values.yaml
# Available chart versions: https://hub.jupyter.org/helm-chart/
#
imagePullSecrets:
  - name: cr-myacrsecret
hub:
  services:
    myapi:
      admin: true
      name: myapi
      api_token: mytoken
singleuser:
  image:
    name: myacr.azurecr.io/interpreter
    tag: latest
```

The first thing we need to configure is to define the name of a secret that we will create containing the necessary credentials to allow the hub to pull images from our Azure Container Registry. We simply need to define a name for it for now. We will create this secret using this name in the next section.

Secondly, we want to configure our external service or api that will interact with our hub. We can define a name for the service, whether or not it should be an administrative service, and an api token that we will use to authenticate with the service. For now, we can hardcode the token as the value for `api_token`, however, in a production environment I would recommend not to keep secrets in your config file and instead generate the token. At a bare minimum I would recommend you do not check in the config file to source control.

```shell
# Generate a random token for this example.
openssl rand -hex 32
```

## 5.2 Creating the infrastructure

Please see [the JupyterHub documentation](https://z2jh.jupyter.org/en/latest/kubernetes/microsoft/step-zero-azure.html) for a more in-depth guide on deploying a K8s cluster to your cloud provider of choice. Again, I will outline the steps I took here as there were some extra steps around setting up the ACR correctly and remembering to add your IP to the NSG that are not outlined in the JupyterHub docs.

For some of the following sets of commands, pay attention to quoting of the parameter values, this is required in some shells like `zsh`.

```shell
# Login to Azure
az login --tenant your-tenant-id

# Set our subscription
az account set --subscription your-subscription-id

# Create a resource group to house our ACR and AKS cluster
az group create --name my-rg-name --location eastus

# Create our ACR
az acr create --resource-group my-rg-name --name myacr --sku Basic

# Login to our ACR
az acr login --name myacr

# Push our custom single-user image to our ACR
docker push myacr.azurecr.io/interpreter

# Create a VNET and SUBNET for our AKS cluster
az network vnet create \
   --resource-group my-rg-name \
   --name my-vnet-name \
   --address-prefixes 10.0.0.0/8 \
   --subnet-name my-subnet-name \
   --subnet-prefix 10.240.0.0/16

# Store our NSG name in a variable for later use.
NSG_NAME=$(
  az resource show \
    --ids "$(
      az network vnet subnet show \
        --resource-group my-rg-name \
        --vnet-name my-vnet-name \
        --name my-subnet-name \
        --query "networkSecurityGroup.id" -o tsv
    )" \
    --query name -o tsv
)

# Add our IP to the Network Security group to allow us to access our JupyterHub instance.
az network nsg rule create --resource-group my-rg-name \
   --nsg-name vnet-dev-eastus-001-snet-dev-eastus-001-nsg-eastus \
   --name "AllowMyIPHttpInbound" \
   --priority 100 \
   --source-address-prefixes "$(curl ifconfig.me)/32" \
   --destination-port-ranges 80 \
   --access Allow \
   --protocol TCP \
   --description "Allow my IP"

# Store our VNET ID in a variable for later use.
VNET_ID=$(az network vnet show \
   --resource-group my-rg-name \
   --name my-vnet-name \
   --query id \
   --output tsv)

# Store our SUBNET ID in a variable for later use.
SUBNET_ID=$(az network vnet subnet show \
   --resource-group my-rg-name \
   --vnet-name my-vnet-name \
   --name my-snet-name \
   --query id \
   --output tsv)

# Create an AAD (Azure AD) service principal for use with the cluster, assigning the Contributor role for use with the VNet, and store the password in a variable.
SP_PASSWD=$(az ad sp create-for-rbac \
   --name my-sp-name \
   --role Contributor \
   --scopes $VNET_ID \
   --query password \
   --output tsv)

# Store our service principal ID in a variable for later use.
SP_ID=$(az ad app list \
   --filter "displayname eq 'my-sp-name'" \
   --query "[0].appId" \
   --output tsv)

# Give our SP permissions to pull containers from our ACR
az role assignment create --assignee $SP_ID --scope /subscriptions/my-subscription-id/resourcegroups/my-rg-name/providers/Microsoft.ContainerRegistry/registries/myacr --role AcrPull

# Generate a public and private SSH key to secure the nodes in our cluster.
ssh-keygen -f my-ssh-key-name

# Create our AKS cluster
az aks create \
   --name my-aks-name \
   --resource-group my-rg-name \
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
   --output table

# Install kubectl
az aks install-cli

# Get our AKS credentials
az aks get-credentials \
   --name my-aks-name \
   --resource-group my-rg-name \
   --output table

# Check if our cluster is fully functional
kubectl get node
```

## 5.3 Deploying JupyterHub

[Install helm](https://helm.sh/docs/intro/install/)

```shell
# Acquire and install helm.
curl https://raw.githubusercontent.com/helm/helm/HEAD/scripts/get-helm-3 | bash

# Check installation
helm version

# Add the JupyterHub helm repo
helm repo add jupyterhub https://hub.jupyter.org/helm-chart/

# Update the helm repo
helm repo update

# Install the JupyterHub helm chart using our configuration
helm upgrade --cleanup-on-fail \
  --install jupyterhub-dev jupyterhub/jupyterhub \
  --namespace my-aks-name \
  --create-namespace \
  --version=3.1.0 \
  --values config.yaml

# Set our AKS context as default
kubectl config use-context my-aks-name

# Create our image pulling credentials
kubectl create secret docker-registry cr-myacrsecret \
   --docker-server=myacr.azurecr.io \
   --docker-username=$SP_ID \
   --docker-password=$SP_PASSWD \
   --namespace my-aks-name

# Ensure our pods are running.
kubectl get pod --namespace my-aks-name

#If you see any pods in a CrashLoopBackOff state, for example, an image puller, check the logs for the pod.
kubectl logs hook-image-puller-8gjqm -n my-aks-name -c image-pull-singleuser

# If you see an error like: exec /bin/sh: exec format error, ensure that your container architecture matches that required by the K8s cluster.
kubectl get nodes -o=jsonpath='{.items[*].status.nodeInfo.architecture}'
docker inspect myacr.azurecr.io/interpreter:latest | grep Architecture

# Find the public IP of our proxy to access our hub
kubectl --namespace my-aks-name get service proxy-public
```

## 5.4 Running the hub example

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

## 5.5 Managing user servers

> [jupyterhub-idle-culler](https://github.com/jupyterhub/jupyterhub-idle-culler) provides a JupyterHub service to identify and stop idle or long-running Jupyter servers via JupyterHub. It works solely by interacting with JupyterHub's REST API, and is often configured to run as a JupyterHub managed service started up by JupyterHub itself.
