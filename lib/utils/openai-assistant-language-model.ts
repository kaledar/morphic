import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
  LanguageModelV1FinishReason
} from '@ai-sdk/provider'
import OpenAI from 'openai'
import { LanguageModelV1CallWarning } from '@ai-sdk/provider'
import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages'
import { prepareToolsAndToolChoice } from './prepare-tools'

export class OpenAIAssistantLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1'
  readonly defaultObjectGenerationMode = 'json'
  readonly modelId: string = 'gpt-4' // Assuming GPT-4, adjust as needed

  private openai: OpenAI
  private assistantId: string
  private static mainAssistantThreadId: string | null = null
  private static mainAssistantRunId: string | null = null

  constructor(apiKey: string, assistantId: string) {
    this.openai = new OpenAI({ apiKey })
    this.assistantId = assistantId
  }

  async doGenerate(options: LanguageModelV1CallOptions): Promise<any> {
    const { prompt, mode } = options

    console.log(`do generate...`)

    const response = await this.runAssistant(prompt, mode.tools || [])

    return {
      text: response.content[0].text.value,
      toolCalls: response.content
        .filter(c => c.type === 'function')
        .map(c => ({
          toolCallType: 'function',
          toolCallId: c.id,
          toolName: c.function.name,
          args: c.function.arguments
        })),
      finishReason: 'stop' as LanguageModelV1FinishReason,
      usage: { promptTokens: 0, completionTokens: 0 }, // Assistant API doesn't provide token usage
      rawCall: { rawPrompt: prompt, rawSettings: {} }
    }
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<any> {
    const { prompt, mode } = options
    const { args, warnings } = this.getArgs(options)
    const { messages: rawPrompt, ...rawSettings } = args

    console.log(
      'customModel: doStream called with options:',
      JSON.stringify(options, null, 2).substring(0, 6000)
    )

    let defaultFinishReason: LanguageModelV1FinishReason = 'other'
    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      start: async controller => {
        try {
          const toolDetails = this.getTools(mode)
          console.log(
            `customModel: doStream mode input tools details: ${JSON.stringify(
              toolDetails
            )}`
          )

          const assistantResponse = await this.runAssistant(prompt, toolDetails)

          console.log(
            `customModel: doStream response:`,
            JSON.stringify(assistantResponse, null, 2).substring(0, 5000)
          )

          if (assistantResponse.type === 'tool-call') {
            console.log(`customModel: doStream: returning tool-call response`)

            for (const toolCall of assistantResponse.toolCalls) {
              // tool calls come in one piece:
              controller.enqueue({
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                argsTextDelta: toolCall.function.arguments
              })
              controller.enqueue({
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                args: toolCall.function.arguments
              })
            }

            defaultFinishReason = 'other'
          } else {
            console.log(`customModel: doStream: processing assistant message`)
            if (
              assistantResponse.content &&
              assistantResponse.content[0] &&
              assistantResponse.content[0].text
            ) {
              const chunks = assistantResponse.content[0].text.value.split(' ')
              for (const chunk of chunks) {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: chunk + ' '
                })
                await new Promise(resolve => setTimeout(resolve, 50))
              }
            }
            defaultFinishReason = 'stop'
          }

          console.log(`customModel: doStream: sending finish event`)

          controller.enqueue({
            type: 'finish',
            finishReason: defaultFinishReason,
            usage: { promptTokens: 0, completionTokens: 0 }
          })
        } catch (error) {
          console.error(
            `customModel: doStream: error in stream response`,
            error
          )
          controller.enqueue({
            type: 'error',
            error: error instanceof Error ? error : new Error(String(error))
          })
        } finally {
          controller.close()
        }
      }
    })

    return {
      stream,
      rawCall: { rawPrompt, rawSettings },
      rawResponse: {}
    }
  }

  private async runAssistant(messages: any[], tools: any[]): Promise<any> {
    console.log(`customModel: running assistant...`)

    // Create a thread if it doesn't exist
    if (!OpenAIAssistantLanguageModel.mainAssistantThreadId) {
      const thread = await this.openai.beta.threads.create()
      OpenAIAssistantLanguageModel.mainAssistantThreadId = thread.id
      console.log(
        `customModel: created new thread with id ${OpenAIAssistantLanguageModel.mainAssistantThreadId}`
      )
    } else {
      console.log(
        `customModel: using existing thread with id ${OpenAIAssistantLanguageModel.mainAssistantThreadId}`
      )
    }

    let toolResultToSubmit: {
      runId: string
      toolCallId: string
      result: any
    } | null = null

    // Find the last assistant message with a tool result
    const toolResultMessage = messages
      .reverse()
      .find(
        message =>
          message.role === 'assistant' &&
          Array.isArray(message.content) &&
          message.content.some(
            content =>
              content.type === 'text' &&
              content.text.includes('"type":"tool-result"')
          )
      )

    if (toolResultMessage) {
      const toolResultContent = toolResultMessage.content.find(
        content =>
          content.type === 'text' &&
          content.text.includes('"type":"tool-result"')
      )

      if (toolResultContent) {
        try {
          const parsedToolResult = JSON.parse(toolResultContent.text)
          if (
            Array.isArray(parsedToolResult) &&
            parsedToolResult[0]?.type === 'tool-result'
          ) {
            const toolResult = parsedToolResult[0]
            console.log(
              `customModel: found tool result for tool ${toolResult.toolName}`
            )
            toolResultToSubmit = {
              runId: OpenAIAssistantLanguageModel.mainAssistantRunId!,
              toolCallId: toolResult.toolCallId,
              result: toolResult.result
            }
          }
        } catch (error) {
          console.error('Error parsing tool result:', error)
        }
      }
    } else {
      // Process and add messages to the thread only if we don't have a tool result
      for (const message of messages) {
        console.log(
          `customModel: processing message: ${JSON.stringify(message).substring(
            0,
            500
          )}`
        )

        await this.openai.beta.threads.messages.create(
          OpenAIAssistantLanguageModel.mainAssistantThreadId!,
          {
            role: message.role === 'system' ? 'user' : message.role,
            content: message.content
          }
        )
      }
    }

    // Submit tool result if exists
    let run = null
    if (toolResultToSubmit) {
      console.log(`customModel: submitting tool result`)
      run = await this.openai.beta.threads.runs.submitToolOutputs(
        OpenAIAssistantLanguageModel.mainAssistantThreadId!,
        toolResultToSubmit.runId,
        {
          tool_outputs: [
            {
              tool_call_id: toolResultToSubmit.toolCallId,
              output: JSON.stringify(toolResultToSubmit.result)
            }
          ]
        }
      )
    } else {
      console.log(
        `customModel: creating run with tools: ${JSON.stringify(tools)}`
      )

      if (tools.length > 0) {
        run = await this.openai.beta.threads.runs.create(
          OpenAIAssistantLanguageModel.mainAssistantThreadId!,
          {
            assistant_id: this.assistantId,
            //instructions:
            //"Use the provided tools to answer questions. If you don't have relevant information, say 'Sorry, I don't know.'",
            //  "As a trained and fine tuned assistant model, summarize tool results accoding to TRT's guidelines, policies and sensitiveness",
            tools: tools,
            tool_choice: 'required'
          }
        )
        OpenAIAssistantLanguageModel.mainAssistantRunId = run.id
      } else {
        run = await this.openai.beta.threads.runs.create(
          OpenAIAssistantLanguageModel.mainAssistantThreadId!,
          {
            assistant_id: this.assistantId
          }
        )
      }
    }

    let runStatus = await this.openai.beta.threads.runs.retrieve(
      OpenAIAssistantLanguageModel.mainAssistantThreadId!,
      run.id
    )

    while (runStatus.status !== 'completed') {
      console.log(`customModel: run status: ${runStatus.status}`)

      if (runStatus.status === 'requires_action') {
        console.log(
          `customModel: runAssistant: run requires action, returning tool-call`
        )
        return {
          type: 'tool-call',
          runId: run.id,
          toolCalls:
            runStatus.required_action?.submit_tool_outputs.tool_calls || []
        }
      } else if (
        runStatus.status === 'in_progress' ||
        runStatus.status === 'queued'
      ) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        runStatus = await this.openai.beta.threads.runs.retrieve(
          OpenAIAssistantLanguageModel.mainAssistantThreadId!,
          run.id
        )
      } else {
        console.log(`customModel: unexpected run status: ${runStatus.status}`)
        break
      }
    }

    if (runStatus.status === 'completed') {
      console.log(`runAssistant: runStatus completed.`)
      const messages = await this.openai.beta.threads.messages.list(
        OpenAIAssistantLanguageModel.mainAssistantThreadId!
      )
      const latestMessage = messages.data[0]
      console.log(
        `customModel: run completed, returning latest message: ${JSON.stringify(
          latestMessage
        ).substring(0, 500)}`
      )
      return latestMessage
    } else {
      console.log(
        `customModel: run ended with unexpected status: ${runStatus.status}`
      )
      throw new Error(`Unexpected run status: ${runStatus.status}`)
    }
  }

  get provider(): string {
    return 'openAiAssistantModel'
  }

  private getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type

    const warnings: LanguageModelV1CallWarning[] = []

    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK'
      })
    }

    if (
      responseFormat != null &&
      responseFormat.type === 'json' &&
      responseFormat.schema != null
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'JSON response format schema is not supported'
      })
    }

    const baseArgs = {
      // model id:
      model: this.modelId,

      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stop: stopSequences,
      seed,

      // response format:
      response_format:
        responseFormat?.type === 'json' ? { type: 'json_object' } : undefined,

      // messages:
      messages: convertToOpenAIChatMessages({
        prompt
      })
    }

    switch (type) {
      case 'regular': {
        console.log(`customModel: type: regular`)
        return {
          args: {
            ...baseArgs,
            ...prepareToolsAndToolChoice({ tools: mode, toolChoice: false })
          },
          warnings
        }
      }

      case 'object-json': {
        console.log(`customModel: type: object-json`)
        return {
          args: {
            ...baseArgs,
            response_format: { type: 'json_object' }
          },
          warnings
        }
      }

      case 'object-tool': {
        console.log(`customModel: type: object-tool`)
        return {
          args: {
            ...baseArgs,
            tool_choice: {
              type: 'function',
              function: { name: mode.tool.name }
            },
            tools: [
              {
                type: 'function',
                function: {
                  name: mode.tool.name,
                  description: mode.tool.description,
                  parameters: mode.tool.parameters
                }
              }
            ]
          },
          warnings
        }
      }

      default: {
        console.log(`customModel: type: default`)
        const _exhaustiveCheck: never = type
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`)
      }
    }
  }

  private getTools(mode: any): any[] {
    if (mode && mode.tools && Array.isArray(mode.tools)) {
      return mode.tools.map(tool => {
        if (tool.type === 'function') {
          return {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters
            }
          }
        }
        return tool
      })
    }
    return []
  }
}
