# The Journey: Building "Advanced Data Analysis"

TL;DR:

- [Tackling the limitations of basic code interpretation solutions.](#22-key-limitations)
- [Investigating workarounds for these limitations.](#231-pseudo-prompts)
- [Unveiling a robust solution for efficient data analysis.](#the-reversal)

## 2.1 The Quick and Dirty

My initial setup was akin to [this implementation](https://github.com/danny-avila/LibreChat/pull/837/files#diff-d89174583267e34034f69f77a62ad1a655e15d88318f25d427f16c04b72da73e), with a twist. It used a containerized server with websockets for code execution and result retrieval, along with file operations handling and a hierarchical file system for user-specific data. Despite its sophistication, I encountered several key limitations.

## 2.2 Key Limitations:

- **Statelessness:** The server's inability to maintain context across multiple messages hindered code execution continuity.

- **Libraries:** A frequent requirement for libraries not pre-installed on the assistant.

- **Plotting Issues:** The use of `Plot.show()` was ineffective due to its process spawning behavior on the server.

- **User Input Handling:** Ineffectiveness in reading user input, as it awaited input on the server side.

- **Stability Concerns:** Risks of service outages due to user code causing infinite loops, blocks, or crashes.

- **File Management:** Inaccurate handling of links to generated files in the assistant's responses.

- **Error Communication:** Initially, failure to relay execution errors, resolved later, enhancing the assistant's problem-solving ability ([source](https://js.langchain.com/docs/modules/agents/tools/how_to/dynamic)).

- **Security Risks:** The potential for users to access or alter each other's files or instances in a shared server environment.

- **Compliance and Contextual Issues:** Deviations from tool instructions, loss of context, and hallucinatory responses led to non-compliant code execution.

## 2.3 Solution 1 - Prompt Engineering:

To mitigate these limitations, I turned to prompt engineering, inspired by projects like [Open Interpreter](https://github.com/KillianLucas/open-interpreter). This technique involved crafting detailed prompts to extend the assistant's operational context and circumvent some challenges. A typical prompt strategy was to incorporate continuous recaps to enhance the model's effective memory.

Specifically, strategies included instructions for the assistant to:

### 2.3.1 Pseudo-Prompts:

- **Limit Library Usage:** Restrict to specified libraries only.
- **Secure File Access:** Only allow access to files in the current user's directory.
- **Adapt Plotting Techniques:** Replace `plot.show()` with saving plots as files.
- **Avoid User Input Dependency:** Eliminate attempts to read user input.
- **Ensure Stateless Code:** Provide self-contained, stateless code blocks.
- **Handle Generated Files Accurately:** Include original, unmodified links for tool-generated files.

These adjustments led to noticeable improvements, particularly in managing generated file links. Nonetheless, while helpful, prompt engineering was only a partial solution.

## 2.4 The Problems with Prompt Engineering:

### 2.4.1 Context Window Challenges:

> Large language models have a fixed-size memory buffer known as a context window, typically around 2048 words or tokens. This limits the model's reference range to the most recent text, with older information being progressively replaced.

Lengthy prompts in prompt engineering can inadvertently consume significant portions of this context window, leading to a loss of focus on the main task and increased inaccuracies or hallucinations.

## 2.5 The Reversal:

While I won't detail the entire reverse engineering process, it involved exploring various GPT "hacks" and "exploits" ([source](https://github.com/LouisShark/chatgpt_system_prompt)). A breakthrough was finding the system prompt for the Advanced Data Analysis feature:

```
You are ChatGPT, a large language model trained by OpenAI, based on the GPT-4 architecture.
Knowledge cutoff: 2022-01
Current date: 2023-10-18

Latex (inline): \( \)
Latex (block): \[ \]

# Tools

## python

When you send a message containing Python code to python, it will be executed in a stateful Jupyter notebook environment. python will respond with the output of the execution or time out after 60.0
seconds. The drive at '/mnt/data' can be used to save and persist user files. Internet access for this session is disabled. Do not make external web requests or API calls as they will fail.
```

The "stateful Jupyter notebook environment" bit suggested a promising solution to the statelessness challenge.

Further investigation into [Jupyter Server](https://jupyter-server.readthedocs.io/en/latest/) revealed its potential.

Additionally, Jupyter's commitment to being an open-source platform ([BSD license](https://opensource.org/licenses/BSD-3-Clause)) aligned well with the project goals.

However, reverse engineering also showed that GPT's code interpretation capabilities are not solely instructed via system messages but are largely a result of fine-tuning. This meant that I couldn't simply undo this tuning to make it use tools in my preferred manner. Instead, a combination of prompt engineering and fine-tuning was necessary to guide its use in non-native scenarios, avoiding conflicts with its inherent capabilities.

Effectiveness Scale:  
**Prompting < Fine-Tuning < Native Prompting < Native Fine-Tuning**

This insight, paired with Jupyter Server's capabilities, led me to adopt it as the cornerstone solution for our Advanced Data Analysis feature.

[Previous: Introduction](./1_introduction.md) | [Next: Key Investigation](./3_key_investigation.md)  
[Table of Contents](../README.md)
