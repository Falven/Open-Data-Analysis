# Open-Data-Analysis

Reverse engineering OpenAI's Advanced Data Analysis feature, formerly Code Interpreter. The steps, learnings and mistakes along the way.

![Open Advanced Data Analysis Icon](assets/open_advanced_data_analysis_icon.png)

## Table of Contents

1. [Introduction](docs/1_introduction.md)
2. [The Journey: Building "Advanced Data Analysis"](docs/2_the_journey.md)
   - [2.1 The Quick and Dirty](docs/2_the_journey.md#21-the-quick-and-dirty)
   - [2.2 Core Limitations](docs/2_the_journey.md#22-core-limitations)
   - [2.3 Solution 1 - Prompt Engineering](docs/2_the_journey.md#23-solution-1---prompt-engineering)
     - [2.3.1 Pseudo-Prompts](docs/2_the_journey.md#231-pseudo-prompts)
   - [2.4 The Problems with Prompt Engineering](docs/2_the_journey.md#24-the-problems-with-prompt-engineering)
     - [2.4.1 Context Window Challenges](docs/2_the_journey.md#241-context-window-challenges)
   - [2.5 The Reversal](docs/2_the_journey.md#25-the-reversal)
3. [Key Investigation](docs/3_key_investigation.md)
   - [3.1 Solution 2 - Jupyter Server](docs/3_key_investigation.md#31-solution-2---jupyter-server)
   - [3.2 Key Limitations with Solution 2](docs/3_key_investigation.md#32-key-limitations-with-solution-2)
     - [3.2.1 Serverless Scalability](docs/3_key_investigation.md#321-serverless-scalability)
   - [3.3 Solution 3 - JupyterHub](docs/3_key_investigation.md#33-solution-3---jupyterhub)
4. [Configuring a Jupyter Server](docs/4_configuring_a_jupyter_server.md)
   - [4.1 Selecting a Jupyter Server image](docs/4_configuring_a_jupyter_server.md#41-selecting-a-jupyter-server-image)
   - [4.2 Creating our custom Dockerfile](docs/4_configuring_a_jupyter_server.md#42-creating-our-custom-dockerfile)
   - [4.3 Building our custom Dockerfile](docs/4_configuring_a_jupyter_server.md#43-building-our-custom-dockerfile)
   - [4.4 Running and Testing the Container Locally](docs/4_configuring_a_jupyter_server.md#44-running-and-testing-the-container-locally)
   - [4.5 Running the Server Example](docs/4_configuring_a_jupyter_server.md#45-running-the-server-example)
5. [Configuring a JupyterHub](docs/5_configuring_a_jupyter_hub.md)
   - [5.1 Configuration](docs/5_configuring_a_jupyter_hub.md#51-configuration)
   - [5.2 Creating the infrastructure](docs/5_configuring_a_jupyter_hub.md#52-creating-the-infrastructure)
   - [5.3 Deploying JupyterHub](docs/5_configuring_a_jupyter_hub.md#53-deploying-jupyterhub)
   - [5.4 Running the hub example](docs/5_configuring_a_jupyter_hub.md#54-running-the-hub-example)
6. [Conclusion](docs/6_conclusion.md)
   - [6.1 Key Takeaways](docs/6_conclusion.md#61-key-takeaways)
   - [6.2 Future Directions](docs/6_conclusion.md#62-future-directions)
   - [6.3 Acknowledgments](docs/6_conclusion.md#63-acknowledgments)
   - [6.4 Final Thoughts](docs/6_conclusion.md#64-final-thoughts)
7. [References](docs/7_references.md)

---

