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

export class Yet1OpenAIAssistantLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1'
  readonly defaultObjectGenerationMode = 'json'
  readonly modelId: string = 'gpt-4' // Assuming GPT-4, adjust as needed

  private openai: OpenAI
  private assistantId: string
  private thread: OpenAI.Beta.Threads.Thread

  constructor(apiKey: string, assistantId: string) {
    this.openai = new OpenAI({ apiKey })
    this.assistantId = assistantId
    //console.log(`this: ${this}`)
    console.log(`this: custom model`)
  }
  get provider(): string {
    return 'taha'
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

  private async runAssistant(messages: any[], tools: any[]): Promise<any> {
    console.log(`customModel: running assistant...`)

    //if (!this.thread) {
    //this.thread = await this.openai.beta.threads.create()
    //}
    const thread = await this.openai.beta.threads.create()

    for (const message of messages) {
      console.log(
        `customModel: runAssistant processing message: ${JSON.stringify(
          message.content
        ).substring(0, 2000)}`
      )
      await this.openai.beta.threads.messages.create(thread.id, {
        //await this.openai.beta.threads.messages.create(this.thread.id, {
        role: 'user',
        //role: message.role, //system is not recognized by the openai assistant
        content: message.content
      })
    }

    //TODO: burada her zaman degil de sanki state'e gore tool-call veya tool-call-restul olacak??

    // This is the place https://platform.openai.com/docs/api-reference/runs/createRun we specify function tools
    console.log(`customModel: assistant threads runs create with tools`)
    const run = await this.openai.beta.threads.runs.create(thread.id, {
      //const run = await this.openai.beta.threads.runs.create(this.thread.id, {
      assistant_id: this.assistantId,
      instructions:
        "Use the provided tools to answer questions. If you don't have relevant information, say 'Sorry, I don't know.'",
      //TODO: asagidaki retrieve function icin de yapilmali ve bunlar args dan gelmeli aslinda.
      tools: [
        {
          type: 'function',
          function: {
            description:
              'RAG retrieval augmentation search function to be called for user query',
            name: 'search',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The query to search for'
                },
                max_results: {
                  type: 'number',
                  description: 'The maximum number of results to return'
                },
                search_depth: {
                  type: 'string',
                  enum: ['basic', 'advanced'],
                  description: 'The depth of the search'
                },
                include_domains: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description:
                    'A list of domains to specifically include in the search results. Default is None, which includes all domains.'
                },
                exclude_domains: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description:
                    "A list of domains to specifically exclude from the search results. Default is None, which doesn't exclude any domains."
                }
              },
              required: ['query', 'max_results', 'search_depth'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#'
            }
          }
        }
      ],
      tool_choice: 'required'
    })

    let runStatus = await this.openai.beta.threads.runs.retrieve(
      thread.id,
      //this.thread.id,
      run.id
    )

    while (runStatus.status !== 'completed') {
      if (runStatus.status === 'requires_action') {
        console.log(
          `customModel: runAssistant assistant runStatus requires_action, will do nothing particular here, let the framework flow know only by setting tool-call as response`
        )

        // https://platform.openai.com/docs/api-reference/runs/submitToolOutputs
        const toolCalls =
          runStatus.required_action?.submit_tool_outputs.tool_calls || []

        //const toolOutputs = await this.handleToolCalls(toolCalls, tools)
        //await this.openai.beta.threads.runs.submitToolOutputs(
        //  thread.id,
        //  run.id,
        //  {
        //    tool_outputs: toolOutputs
        //  }
        //)
        break
      } else if (messages.some(m => m.role === 'assistant')) {
        console.log(
          `customModel: runAssistant: processing assistant tool_result to submit to assistant.s`
        )
        const assistantToolResult = messages.find(m => m.role === 'assistant')
        await this.openai.beta.threads.runs.submitToolOutputs(
          thread.id,
          //this.thread.id,
          run.id,
          {
            tool_outputs: [
              {
                output: assistantToolResult.content[0].text,
                tool_call_id: 'call_E5aQKIMYvHzf3Kz3qbyRCvrD'
              }
            ]
          }
        )
      } else {
        console.log(
          `customModel: runAssistant: other runstatus: ${JSON.stringify(
            runStatus.status
          )}`
        )

        await new Promise(resolve => setTimeout(resolve, 1000))
        runStatus = await this.openai.beta.threads.runs.retrieve(
          thread.id,
          run.id
        )
      }
    }

    /*
    const messages1 = await this.openai.beta.threads.messages.list(thread.id)
    return messages1.data[0]
    */
    return runStatus
  }

  private async handleToolCalls(
    toolCalls: any[],
    tools: any[]
  ): Promise<any[]> {
    return Promise.all(
      toolCalls.map(async toolCall => {
        const tool = tools.find(t => t.name === toolCall.function.name)
        if (!tool) {
          throw new Error(`Tool ${toolCall.function.name} not found`)
        }
        const result = await tool.execute(
          JSON.parse(toolCall.function.arguments)
        )
        return {
          tool_call_id: toolCall.id,
          output: JSON.stringify(result)
        }
      })
    )
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

    //console.log(`customModel: doStream: args: ${JSON.stringify(args)}`)

    console.log(
      'customModel: doStream called with options:',
      JSON.stringify(options, null, 2).substring(0, 5000)
    )

    const { messages: rawPrompt, ...rawSettings } = args

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      start: async controller => {
        try {
          const runStatus = await this.runAssistant(prompt, mode.tools || [])
          //const runStatus = await this.runAssistant(messages, mode.tools || [])

          console.log(
            `customModel: doStream: start: listing the messages from the thread`
          )
          const messages1 = await this.openai.beta.threads.messages.list(
            runStatus.thread_id
          )
          const response = messages1.data[0]

          console.log(
            `customModel: doStream: assistant response is: ${JSON.stringify(
              response
            )}`
          )

          // Handle tool calls
          //for (const content of response.content) {
          //  if (content.type === 'function') {
          if (runStatus.status === 'requires_action') {
            //buraya geliyoruz.
            console.log(
              `customModel: doStream: content is function or to say assistant requires action of tool-call, so we get it conttinued`
            )

            // send delta
            /*
            controller.enqueue({
              type: 'tool-call-delta',
              toolCallType: 'function',
              toolCallId:
                runStatus.required_action.submit_tool_outputs.tool_calls[0].id,
              toolName:
                runStatus.required_action.submit_tool_outputs.tool_calls[0]
                  .function.name,
              argsTextDelta:
                runStatus.required_action.submit_tool_outputs.tool_calls[0]
                  .function.arguments
            })
                  */

            //TODO: tool-call-delta?? mistral ornegine bak.
            //TODO: submit_to ne zaman cagrilacak.
            controller.enqueue({
              type: 'tool-call',
              toolCallType: 'function',
              //toolCallId: content.id,
              toolCallId:
                runStatus.required_action.submit_tool_outputs.tool_calls[0].id,
              //toolName: content.function.name,
              toolName:
                runStatus.required_action.submit_tool_outputs.tool_calls[0]
                  .function.name,
              //args: content.function.arguments
              args: runStatus.required_action.submit_tool_outputs.tool_calls[0]
                .function.arguments
            })
          }
          //}
          //}
          else if (response.content[0]) {
            console.log(
              `customModel: doStream: no tool call, just text response - processing content`
            )
            // Simulate streaming for text response
            const chunks = response.content[0].text.value.split(' ')
            for (const chunk of chunks) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: chunk + ' '
              })
              await new Promise(resolve => setTimeout(resolve, 50)) // Simulate delay
            }
          } else {
            //buraya hic gelmioyr
            console.log(
              `customModel: doStream: processing finish, but TODO: currently no enqueue of finish-stop`
            )
            /*
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 0, completionTokens: 0 }
            })
              */
          }
        } catch (error) {
          console.error(`customModel: doStream: error in stream response`)
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
      rawCall: { rawPrompt: prompt, rawSettings: {} },
      rawResponse: {}
    }
  }
}
