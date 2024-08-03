import {
  LanguageModelV1FunctionTool,
  LanguageModelV1ToolChoice
} from '@ai-sdk/provider'

export function prepareToolsAndToolChoice<any>({
  tools,
  toolChoice
}: {
  tools: any
  toolChoice: any
}): {
  tools: LanguageModelV1FunctionTool[] | undefined
  toolChoice: LanguageModelV1ToolChoice | undefined
} {
  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      type: 'function' as const,
      name,
      description: tool.description,
      parameters: tools.parameters
    })),
    toolChoice:
      toolChoice == null
        ? { type: 'auto' }
        : typeof toolChoice === 'string'
        ? { type: toolChoice }
        : { type: 'tool' as const, toolName: toolChoice.toolName as string }
  }
}
