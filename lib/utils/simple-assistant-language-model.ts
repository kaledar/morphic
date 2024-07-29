import {
  LanguageModelV1,
  LanguageModelV1StreamPart,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1FunctionToolCall,
  LanguageModelV1LogProbs
} from '@ai-sdk/provider'
import OpenAI from 'openai'

export class SimpleOpenAIAssistantLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1'
  readonly provider = 'openai-assistant'
  readonly modelId: string
  readonly defaultObjectGenerationMode = 'tool'

  private openai: OpenAI
  private assistantId: string

  constructor(apiKey: string, assistantId: string, baseURL?: string) {
    this.openai = new OpenAI({ apiKey, baseURL })
    this.assistantId = assistantId
    this.modelId = assistantId
  }

  async doGenerate(options: LanguageModelV1CallOptions): Promise<{
    text?: string
    toolCalls?: Array<LanguageModelV1FunctionToolCall>
    finishReason: LanguageModelV1FinishReason
    usage: { promptTokens: number; completionTokens: number }
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> }
    rawResponse?: { headers?: Record<string, string> }
    warnings?: LanguageModelV1CallWarning[]
    logprobs?: LanguageModelV1LogProbs
  }> {
    const { result, toolCalls, warnings } = await this.processAssistant(
      options.prompt
    )

    return {
      text: result,
      toolCalls,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0
      },
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: options
      },
      warnings
    }
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> }
    rawResponse?: { headers?: Record<string, string> }
    warnings?: LanguageModelV1CallWarning[]
  }> {
    const { result, toolCalls, warnings } = await this.processAssistant(
      options.prompt
    )

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      async start(controller) {
        // Yield text delta
        controller.enqueue({ type: 'text-delta', textDelta: result })

        // Yield tool calls
        for (const toolCall of toolCalls) {
          controller.enqueue({
            type: 'tool-call',
            ...toolCall
          })
        }

        // Yield finish
        controller.enqueue({
          type: 'finish',
          finishReason: 'stop',
          usage: {
            promptTokens: 0,
            completionTokens: 0
          }
        })

        controller.close()
      }
    })

    return {
      stream,
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: options
      },
      warnings
    }
  }

  private async processAssistant(
    prompt: LanguageModelV1CallOptions['prompt']
  ): Promise<{
    result: string
    toolCalls: LanguageModelV1FunctionToolCall[]
    warnings: LanguageModelV1CallWarning[]
  }> {
    const thread = await this.openai.beta.threads.create()
    const warnings: LanguageModelV1CallWarning[] = []

    for (const message of prompt) {
      await this.openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: this.formatMessageContent(message.content)
      })
    }

    const run = await this.openai.beta.threads.runs.create(thread.id, {
      assistant_id: this.assistantId
    })

    let runStatus = await this.openai.beta.threads.runs.retrieve(
      thread.id,
      run.id
    )
    while (runStatus.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000))
      runStatus = await this.openai.beta.threads.runs.retrieve(
        thread.id,
        run.id
      )
    }

    const messages = await this.openai.beta.threads.messages.list(thread.id)
    const assistantMessages = messages.data.filter(
      message => message.role === 'assistant'
    )

    let result = ''
    const toolCalls: LanguageModelV1FunctionToolCall[] = []

    for (const message of assistantMessages) {
      for (const content of message.content) {
        if (content.type === 'text') {
          result += content.text.value + '\n'
        }
        /* else if (content.type === 'function') {
            toolCalls.push({
              toolCallType: 'function',
              toolCallId: content.function.id || '',
              toolName: content.function.name || '',
              args: content.function.arguments || '{}'
            });
          }
            */
      }
    }

    return { result, toolCalls, warnings }
  }

  private formatMessageContent(
    content: string | Array<{ type: string; text?: string }>
  ): string {
    if (typeof content === 'string') {
      return content
    }
    return content.map(part => part.text || '').join('\n')
  }
}
