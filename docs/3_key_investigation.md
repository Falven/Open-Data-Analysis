# Key Investigation

TL;DR: This page discusses how Jupyter Server provides solutions to earlier limitations, enabling stateful execution, better file handling, and error management. It also addresses scalability and orchestration challenges, ultimately leading to the adoption of JupyterHub, which offers a multi-user server environment ideal for this project's needs.

## 3.1 Solution 2 - Jupyter Server:

My exploration into Jupyter Server's functionalities revealed it as a solution for most of the core limitations discussed in [2.2 Key Limitations:](./2_the_journey.md#22-key-limitations).

- **Stateful Execution**: The Python Kernel in Jupyter allows stateful code execution, enabling context retention across executions.
- **Plotting**: Jupyter Server sends specific client messages when plots are rendered, facilitating plot saving or display.
- **User Input**: It sends distinct messages for handling user input requests.
- **Crashing**: When errors occur, Jupyter Server communicates these via specific messages for appropriate handling.
- **Generated Files**: It streamlines the process of uploading or accessing generated files.
- **Error Communication**: Enhanced the assistant's problem-solving ability by [communicating code errors](https://js.langchain.com/docs/modules/agents/tools/how_to/dynamic), allowing it to attempt to correct its mistakes.

Jupyter Server addresses most of the limitations related to single-server setup.

However, challenges remain regarding scalability and user environment management. Custom solutions for these would not be straightforward.

## 3.2 Key Limitations with Solution 2:

- **Scalability**: Our goal is to support a large user base efficiently.
- **User Environments**: Each user should have their own isolated environment.
- **Orchestration**: Managing and directing user traffic to their respective environments and proxying requests is crucial.

### 3.2.1 Serverless Scalability:

Considering that code interpretation on a chat platform involves mostly short-lived and sporadic interactions, a serverless architecture can be highly effective. Azure's serverless container jobs, offering ephemeral storage mounts for a set duration, present an ideal solution. These jobs eliminate the need for server or infrastructure management, offering boundless scalability and security. The main challenge lies in establishing connectivity since container jobs lack a public IP address. This can be solved by a reverse connection: the orchestrator initiates the container job, which then connects back to the orchestrator via websockets, creating a full duplex communication channel. Users connect to the orchestrator through websockets, and the orchestrator then proxies these requests to the relevant container job.

This architecture begins to resemble a more managed solution, akin to a Kubernetes (K8s) cluster, with an orchestrator, proxy service, and single-user container pods.

## 3.3 Solution 3 - JupyterHub:

Assembling these components, a question arises: "Wouldn't it be ideal to have a K8s cluster that:

- Manages stateful Python execution environments?
- Spawns ephemeral, single-user containers on demand in a scalable, secure manner?
- Handles the orchestration and proxying of these containers?
- Manages storage for these ephemeral environments?"

In essence, a server like Jupyter but designed for multiple users?

Enter JupyterHub: a multi-user server for Jupyter notebooks. It enables on-demand spawning of single-user Jupyter Notebook servers, perfectly aligning with our project's requirements.

[Previous: The Journey](./2_the_journey.md) | [Next: Configuring a Jupyter Server](./4_configuring_a_jupyter_server.md)  
[Table of Contents](../README.md)
