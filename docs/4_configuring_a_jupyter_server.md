# Configuring a Jupyter Server

TL;DR: This page provides a step-by-step guide on setting up a Jupyter Server, including creating a Dockerfile with necessary libraries, building a Docker container for different architectures, and running and testing the server locally. It also covers the integration of LangChain JS and Azure OpenAI to generate and execute code.

## 4.1 Selecting a Jupyter Server image

Extensive documentation on [Jupyter Docker Stacks](https://jupyter-docker-stacks.readthedocs.io/en/latest/index.html) provides guidance on selecting a stack and details the tools and features included in each.

I selected the [jupyter/base-notebook](https://jupyter-docker-stacks.readthedocs.io/en/latest/using/selecting.html#jupyter-base-notebook) stack for its minimal yet sufficient set of tools and features for our use case, including:

- notebook, jupyterhub, and jupyterlab packages.
- A `start-singleuser.py` script, useful for launching containers in JupyterHub.

## 4.2 Creating our custom Dockerfile

Configuring the Jupyter Server is straightforward with a Dockerfile.

We begin by creating a `requirements.txt` file at the project's root, listing all libraries needed for code execution.

```txt
numpy
matplotlib
pandas
openpyxl
PyPDF2
```

Using the chosen image as our base layer, we copy the requirements file and install these libraries using the base conda environment.

```Dockerfile
FROM quay.io/jupyter/base-notebook:latest

COPY requirements.txt /

RUN conda install -y --file /requirements.txt
```

## 4.3 Building our custom Dockerfile

When planning for JupyterHub deployment, consider your target platform. This guide demonstrates deployment to Azure Kubernetes Service, which required building the container for arm64.

```shell
docker buildx build --platform linux/amd64,linux/arm64 -t myacr.azurecr.io/interpreter:latest -f Dockerfile .
```

## 4.4 Running and testing the container locally:

To test locally, run:

```shell
docker run --name interpreter -p 8888:8888 myacr.azureacr.io/interpreter
```

Once the server starts, you should see output similar to:

```
2023-11-30 22:33:21 [I 2023-12-01 03:33:21.563 ServerApp] Jupyter Server 2.10.1 is running at:
2023-11-30 22:33:21 [I 2023-12-01 03:33:21.563 ServerApp] http://839752b66aef:8888/lab?token=8eeeae6feee65e5dd2072aab8023a68d0f0f41d6c4b500ee
2023-11-30 22:33:21 [I 2023-12-01 03:33:21.563 ServerApp]     http://127.0.0.1:8888/lab?token=8eeeae6feee65e5dd2072aab8023a68d0f0f41d6c4b500ee
```

Note the authentication token (`?token=...`), which is essential for later use. You can now access the Jupyter Lab interface via the provided link.

You should now also be able to click on the link in the terminal output and see the Jupyter Lab interface.

## 4.5 Running the server example

This doumentation uses [LangChain JS](https://js.langchain.com/) and [Azure OpenAI](https://learn.microsoft.com/en-us/azure/ai-services/openai/overview) for code interpretation. Alternatively, you may configure the example to use OpenAI or other compatible services and frameworks.

Create a .env file in your project root with the following variables:

```env
JUPYTER_URL=127.0.0.1:8888
JUPYTER_TOKEN=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_API_INSTANCE_NAME=
AZURE_OPENAI_API_DEPLOYMENT_NAME=
AZURE_OPENAI_API_VERSION=2023-08-01-preview
```

This example uses `pnpm`, which can be easily enabled or installed [using corepack](https://pnpm.io/installation#using-corepack).

```shell
corepack enable
corepack prepare pnpm@latest --activate
```

Install dependencies with `pnpm install`.

To run the example, use the `launch.json` configurations in VSCode (F5 or play) or execute `pnpm run start:server`.

Interacting with the assistant should now execute code on the Jupyter Server:

```shell
You: Execute some code that prints Hello Jupyter Server!
Starting WebSocket: ws://127.0.0.1:8888/api/kernels/ce9fc73f-eb89-4dac-a867-3b88a0effec3
Assistant: The code has been executed and it printed: "Hello Jupyter Server!"
```

Leveraging [`@jupterlab/services`](https://github.com/jupyterlab/jupyterlab) or the [Jupyter Lab API](https://jupyter-server.readthedocs.io/en/latest/developers/rest-api.html) from a [LangChain Tool](https://js.langchain.com/docs/modules/agents/tools/), we gain considerable flexibility in handling diverse interactions with Jupyter Server.

Notably, as you may recall from the system prompt, OpenAI's Advanced Data Analysis feature also uses a Tool for interacting with its stateful Jupyter notebook environment.

In the Jupyter Lab interface, you'll find a user directory with a notebook containing the executed code and its results.

![Jupyter Lab](../assets/jupyter_lab.png)

[Previous: Key Investigation](./3_key_investigation.md) | [Next: Configuring a Jupyter Hub](./5_configuring_a_jupyter_hub.md)  
[Table of Contents](../README.md)
