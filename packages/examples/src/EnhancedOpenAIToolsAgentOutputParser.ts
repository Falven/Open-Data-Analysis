import {
  OpenAIToolsAgentOutputParser,
  ToolsAgentAction,
} from 'langchain/agents/openai/output_parser';
import { BaseMessage, AgentFinish } from 'langchain/schema';
import { OutputParserException } from 'langchain/schema/output_parser';
import { Json, StructuredTool } from 'langchain/tools';
import { JsonSchema7ObjectType, zodToJsonSchema } from 'zod-to-json-schema';

export class EnhancedOpenAIToolsAgentOutputParser extends OpenAIToolsAgentOutputParser {
  private tools: StructuredTool[];

  constructor(tools: StructuredTool[]) {
    super();
    this.tools = tools;
  }

  parseAIMessage(message: BaseMessage): ToolsAgentAction[] | AgentFinish {
    try {
      // First try to parse the message normally
      return super.parseAIMessage(message);
    } catch (error) {
      if (error instanceof OutputParserException) {
        // Handle the OutputParserException
        if (message.additional_kwargs.tool_calls) {
          const toolCalls = message.additional_kwargs.tool_calls;

          // Modify toolCalls here based on the structuredToolSchema
          const modifiedToolCalls = toolCalls.map((toolCall) => {
            // Implement logic to modify toolCall based on the structuredToolSchema
            const modifiedArguments = this.modifyArgumentsBasedOnSchema(
              toolCall.function.name,
              toolCall.function.arguments,
            );
            toolCall.function.arguments = JSON.stringify(modifiedArguments);
            return toolCall;
          });

          // Retry parsing with modified toolCalls
          message.additional_kwargs.tool_calls = modifiedToolCalls;
          return super.parseAIMessage(message);
        }
      }
      // If the error is not an OutputParserException, rethrow it
      throw error;
    }
  }

  private modifyArgumentsBasedOnSchema(toolName: string, toolArgs: string): any {
    // Find the corresponding tool based on toolName
    const tool = this.tools.find((t) => t.name === toolName);
    if (!tool || !tool.schema) {
      throw new Error(`Schema not found for tool: ${toolName}`);
    }

    // Convert the Zod schema to JSON Schema
    const jsonSchema = zodToJsonSchema(tool.schema) as JsonSchema7ObjectType;

    // Analyze the JSON Schema to determine where to insert arguments
    // This is a placeholder for actual logic to analyze the schema
    // For example, find the first property of type 'string' and use it
    const targetProperty = this.findTargetPropertyForArguments(jsonSchema);

    // Create an object conforming to the JSON Schema
    let modifiedArguments: any = {};
    // ... logic to populate modifiedArguments based on jsonSchema ...

    // Insert the arguments into the determined place
    modifiedArguments[targetProperty] = toolArgs;

    return modifiedArguments;
  }

  private findTargetPropertyForArguments(jsonSchema: JsonSchema7ObjectType): string {
    if (!jsonSchema.required || jsonSchema.required.length === 0) {
      throw new Error('No required properties defined in the JSON Schema');
    }

    if (!jsonSchema.properties) {
      throw new Error('No properties defined in the JSON Schema');
    }

    // Iterate through the required array
    for (const propName of jsonSchema.required) {
      if (jsonSchema.properties[propName]) {
        return propName; // Return the first required property that exists in the properties object
      }
    }

    // If no suitable property is found, you can either throw an error or handle it differently
    throw new Error('No suitable required property found in the JSON Schema');
  }
}
