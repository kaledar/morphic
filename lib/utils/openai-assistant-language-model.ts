import {
  InvalidResponseDataError,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1LogProbs,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError
} from '@ai-sdk/provider'
import {
  ParseResult,
  //combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParsableJson,
  postJsonToApi
} from '@ai-sdk/provider-utils'
import { z } from 'zod'

import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages'
import { mapOpenAIFinishReason } from './map-openai-finish-reason'
import { mapOpenAIChatLogProbsOutput } from './map-openai-chat-logprobs'
import {
  openAIErrorDataSchema,
  openaiFailedResponseHandler
} from './openai-error'
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings'

type OpenAIChatConfig = {
  provider: string
  compatibility: 'strict' | 'compatible'
  headers: () => Record<string, string | undefined>
  url: (options: { modelId: string; path: string }) => string
  fetch?: typeof fetch
}

export class OpenAIAssistantLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1'
  readonly defaultObjectGenerationMode = 'tool'

  readonly modelId: OpenAIChatModelId
  readonly settings: OpenAIChatSettings
  readonly assistantId: string

  private readonly config: OpenAIChatConfig

  constructor(
    modelId: OpenAIChatModelId,
    settings: OpenAIChatSettings,
    config: OpenAIChatConfig,
    assistantId: string
  ) {
    this.modelId = modelId
    this.settings = settings
    this.config = config
    this.assistantId = assistantId

    console.log(`model has been created`)
  }

  get provider(): string {
    return this.config.provider
  }

  private getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    //topK,
    frequencyPenalty,
    presencePenalty,
    //stopSequences,
    //responseFormat,
    seed
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type

    const warnings: LanguageModelV1CallWarning[] = []

    /*
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
      */

    const useLegacyFunctionCalling = this.settings.useLegacyFunctionCalling

    if (useLegacyFunctionCalling && this.settings.parallelToolCalls === true) {
      throw new UnsupportedFunctionalityError({
        functionality: 'useLegacyFunctionCalling with parallelToolCalls'
      })
    }

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      logit_bias: this.settings.logitBias,
      logprobs:
        this.settings.logprobs === true ||
        typeof this.settings.logprobs === 'number'
          ? true
          : undefined,
      top_logprobs:
        typeof this.settings.logprobs === 'number'
          ? this.settings.logprobs
          : typeof this.settings.logprobs === 'boolean'
          ? this.settings.logprobs
            ? 0
            : undefined
          : undefined,
      user: this.settings.user,
      parallel_tool_calls: this.settings.parallelToolCalls,

      // standardized settings:
      //max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      //stop: stopSequences,
      seed,

      // response format:
      //response_format:
      //  responseFormat?.type === 'json' ? { type: 'json_object' } : undefined,

      // messages:
      messages: convertToOpenAIChatMessages({
        prompt,
        useLegacyFunctionCalling
      })
    }

    switch (type) {
      case 'regular': {
        return {
          args: {
            ...baseArgs,
            ...prepareToolsAndToolChoice({ mode, useLegacyFunctionCalling })
          },
          warnings
        }
      }

      case 'object-json': {
        return {
          args: {
            ...baseArgs,
            response_format: { type: 'json_object' }
          },
          warnings
        }
      }

      case 'object-tool': {
        return {
          args: useLegacyFunctionCalling
            ? {
                ...baseArgs,
                function_call: {
                  name: mode.tool.name
                },
                functions: [
                  {
                    name: mode.tool.name,
                    description: mode.tool.description,
                    parameters: mode.tool.parameters
                  }
                ]
              }
            : {
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
        const _exhaustiveCheck: never | string = type
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`)
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    console.log(`dogenerate ...`)

    const { args, warnings } = this.getArgs(options)

    console.log(`creating a thread...`)
    // Create a thread
    const threadResponse = await postJsonToApi({
      url: this.config.url({
        path: '/threads',
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), {}),
      body: {},
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        z.object({
          id: z.string()
        })
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    })

    const threadId = threadResponse.value.id

    console.log(`adding messages to the thread`)

    // Add messages to the thread
    for (const message of args.messages) {
      console.log(`message is: ${message}`)
      await postJsonToApi({
        url: this.config.url({
          path: `/threads/${threadId}/messages`,
          modelId: this.modelId
        }),
        headers: combineHeaders(this.config.headers(), {}),
        body: {
          //role: message.role,
          role: 'user',
          content: message.content
        },
        failedResponseHandler: openaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(z.object({})),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch
      })
    }

    console.log(`running the assistant`)

    // Run the assistant
    const runResponse = await postJsonToApi({
      url: this.config.url({
        path: `/threads/${threadId}/runs`,
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), {}),
      body: {
        assistant_id: this.assistantId
        //...args
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        z.object({
          id: z.string()
        })
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    })

    const runId = runResponse.value.id

    // Poll for completion
    let runStatus
    do {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const statusResponse = await fetch(
        this.config.url({
          path: `/threads/${threadId}/runs/${runId}`,
          modelId: this.modelId
        }),
        {
          method: 'GET',
          headers: combineHeaders(this.config.headers(), {}),
          signal: options.abortSignal
        }
      )

      if (!statusResponse.ok) {
        console.error(`error while polling run status`)
        const errorData = await statusResponse.json().catch(() => ({}))
        //throw openaiFailedResponseHandler(statusResponse, errorData)
      }

      const runStatus = await statusResponse.json()
      //runStatus = statusResponse.value

      if (runStatus.required_action?.submit_tool_outputs) {
        console.log(`handle this`)
        // Handle tool calls here
        // This would involve executing the tools and submitting the results
        // For brevity, we're skipping the implementation of this part
      }
    } while (runStatus.status !== 'completed' && runStatus.status !== 'failed')

    console.log(`retrieving messages`)

    // Retrieve messages
    const messagesResponse = await fetch(
      this.config.url({
        path: `/threads/${threadId}/messages`,
        modelId: this.modelId
      }),
      {
        method: 'GET',
        headers: combineHeaders(this.config.headers(), options.headers),
        signal: options.abortSignal
      }
    )

    if (!messagesResponse.ok) {
      const errorData = await messagesResponse.json().catch(() => ({}))
      throw openaiFailedResponseHandler(messagesResponse, errorData)
    }

    const messagesData = await messagesResponse.json()

    const assistantMessage = messagesData.value.data.find(
      m => m.role === 'assistant'
    )
    const messageContent = assistantMessage?.content[0]?.text?.value || ''

    return {
      text: messageContent,
      toolCalls: [], // Implement tool calls processing if needed
      finishReason: mapOpenAIFinishReason(runStatus.status),
      usage: {
        promptTokens: 0, // The Assistants API doesn't provide token usage
        completionTokens: 0
      },
      rawCall: { rawPrompt: args.messages, rawSettings: args },
      rawResponse: { headers: messagesResponse.responseHeaders },
      warnings,
      logprobs: undefined // The Assistants API doesn't provide log probs
    }
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    console.log(`dostream...`)

    const { args, warnings } = this.getArgs(options)

    //if (args.messages.every(m => m.role == 'user' || m.role == 'system')) return;

    //create a thread
    console.log(`do stream: creating a thread`)
    //const { responseHeaders, value: response } = await postJsonToApi({
    const threadResponse = await postJsonToApi({
      url: this.config.url({
        path: '/threads',
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), {}),
      body: {},
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        z.object({ id: z.string() })
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    })

    const threadId = threadResponse.value.id

    // Add messages to the thread
    for (const message of args.messages) {
      console.log(
        `do stream message content | role: ${message.content} | ${message.role}`
      )
      if (!message || !message.content || message.content == '') {
        continue
      }

      //if (message.role == 'user' || message.role == 'system') {
      //  continue
      //}

      await postJsonToApi({
        url: this.config.url({
          path: `/threads/${threadId}/messages`,
          modelId: this.modelId
        }),
        headers: combineHeaders(this.config.headers(), {}),
        body: {
          //role: message.role,
          role: 'user',
          content: message.content
        },
        failedResponseHandler: openaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(z.object({})),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch
      })
    }

    console.log(`dostream running the assistant...`)

    // Run the assistant
    const runResponse = await postJsonToApi({
      url: this.config.url({
        path: `/threads/${threadId}/runs`,
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), {}),
      body: {
        assistant_id: this.assistantId
        //...args
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        z.object({ id: z.string() })
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    })

    const runId = runResponse.value.id

    const threadsMessagesUrl = this.config.url({
      path: `/threads/${threadId}/messages`,
      modelId: this.modelId
    })

    const threadsRuns = this.config.url({
      path: `/threads/${threadId}/runs/${runId}`,
      modelId: this.modelId
    })

    const headers = combineHeaders(this.config.headers(), {})

    const stream = new ReadableStream<
      ParseResult<z.infer<typeof openaiChatChunkSchema>>
    >({
      async start(controller) {
        let runStatus
        let cursor: string | undefined

        do {
          // Check run status
          console.log(`dostream checkin run status...`)
          const statusResponse = await fetch(threadsRuns, {
            method: 'GET',
            headers: headers,
            signal: options.abortSignal
          })

          if (!statusResponse.ok) {
            console.error(`error while checking run status do stream`)
            controller.error(new Error('Failed to fetch run status'))
            return
          }

          runStatus = await statusResponse.json()

          console.log(`dostream runstatus: ${JSON.stringify(runStatus)}`)

          // Fetch new messages
          console.log(`fetching to fetch 111 threadsMessagesUrl cursor`)
          const messagesResponse = await fetch(
            `${threadsMessagesUrl}${cursor ? `?after=${cursor}` : ''}`,
            {
              method: 'GET',
              headers: headers,
              signal: options.abortSignal
            }
          )

          if (!messagesResponse.ok) {
            console.error(`failed to fetch 111 threadsMessagesUrl cursor`)
            controller.error(new Error('Failed to fetch messages'))
            return
          }

          const messagesData = await messagesResponse.json()

          console.log(`dostream messagesData: ${messagesData}`)

          // Process new messages
          for (const message of messagesData.data) {
            if (message.role === 'assistant') {
              for (const content of message.content) {
                if (content.type === 'text') {
                  // Simulate an OpenAI chat chunk
                  controller.enqueue({
                    success: true,
                    value: {
                      choices: [
                        {
                          index: 1,
                          delta: {
                            content: content.text.value
                          },
                          finish_reason: null
                        }
                      ]
                    }
                  })
                }
                // Handle other content types if needed
              }
            }
            cursor = message.id
          }

          // Check if run is completed or failed
          if (runStatus.status === 'completed') {
            controller.enqueue({
              success: true,
              value: {
                choices: [
                  {
                    index: 1,
                    finish_reason: 'stop'
                  }
                ],
                usage: {
                  prompt_tokens: 0,
                  completion_tokens: 0
                }
              }
            })
            controller.close()
            return
          } else if (runStatus.status === 'failed') {
            controller.error(new Error('Assistant run failed'))
            return
          }

          // Wait before next iteration
          await new Promise(resolve => setTimeout(resolve, 1000))
        } while (
          runStatus.status !== 'completed' &&
          runStatus.status !== 'failed'
        )
      }
    })

    const { messages: rawPrompt, ...rawSettings } = args

    const toolCalls: Array<{
      id: string
      type: 'function'
      function: {
        name: string
        arguments: string
      }
    }> = []

    let finishReason: LanguageModelV1FinishReason = 'other'
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN
    }
    let logprobs: LanguageModelV1LogProbs

    const { useLegacyFunctionCalling } = this.settings

    return {
      stream: stream.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof openaiChatChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = 'error'
              controller.enqueue({ type: 'error', error: chunk.error })
              return
            }

            const value = chunk.value

            // handle error chunks:
            if ('error' in value) {
              finishReason = 'error'
              controller.enqueue({ type: 'error', error: value.error })
              return
            }

            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens,
                completionTokens: value.usage.completion_tokens
              }
            }

            const choice = value.choices[0]

            if (choice?.finish_reason != null) {
              finishReason = mapOpenAIFinishReason(choice.finish_reason)
            }

            if (choice?.delta == null) {
              return
            }

            const delta = choice.delta

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content
              })
            }

            const mappedLogprobs = mapOpenAIChatLogProbsOutput(choice?.logprobs)
            if (mappedLogprobs?.length) {
              if (logprobs === undefined) logprobs = []
              logprobs.push(...mappedLogprobs)
            }

            const mappedToolCalls: typeof delta.tool_calls =
              useLegacyFunctionCalling && delta.function_call != null
                ? [
                    {
                      type: 'function',
                      id: generateId(),
                      function: delta.function_call,
                      index: 0
                    }
                  ]
                : delta.tool_calls

            if (mappedToolCalls != null) {
              for (const toolCallDelta of mappedToolCalls) {
                const index = toolCallDelta.index

                // Tool call start. OpenAI returns all information except the arguments in the first chunk.
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== 'function') {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`
                    })
                  }

                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`
                    })
                  }

                  if (toolCallDelta.function?.name == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`
                    })
                  }

                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? ''
                    }
                  }

                  const toolCall = toolCalls[index]

                  // check if tool call is complete (some providers send the full tool call in one chunk)
                  if (
                    toolCall.function?.name != null &&
                    toolCall.function?.arguments != null &&
                    isParsableJson(toolCall.function.arguments)
                  ) {
                    // send delta
                    controller.enqueue({
                      type: 'tool-call-delta',
                      toolCallType: 'function',
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                      argsTextDelta: toolCall.function.arguments
                    })

                    // send tool call
                    controller.enqueue({
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: toolCall.id ?? generateId(),
                      toolName: toolCall.function.name,
                      args: toolCall.function.arguments
                    })
                  }

                  continue
                }

                // existing tool call, merge
                const toolCall = toolCalls[index]

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
                    toolCallDelta.function?.arguments ?? ''
                }

                // send delta
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: toolCallDelta.function.arguments ?? ''
                })

                // check if tool call is complete
                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments
                  })
                }
              }
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              logprobs,
              usage
            })
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      //rawResponse: { headers: responseHeaders },
      warnings
    }
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openAIChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant'),
        content: z.string().nullish(),
        function_call: z
          .object({
            arguments: z.string(),
            name: z.string()
          })
          .nullish(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string()
              })
            })
          )
          .nullish()
      }),
      index: z.number(),
      logprobs: z
        .object({
          content: z
            .array(
              z.object({
                token: z.string(),
                logprob: z.number(),
                top_logprobs: z.array(
                  z.object({
                    token: z.string(),
                    logprob: z.number()
                  })
                )
              })
            )
            .nullable()
        })
        .nullish(),
      finish_reason: z.string().nullish()
    })
  ),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number()
  })
})

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiChatChunkSchema = z.union([
  z.object({
    choices: z.array(
      z.object({
        delta: z
          .object({
            role: z.enum(['assistant']).optional(),
            content: z.string().nullish(),
            function_call: z
              .object({
                name: z.string().optional(),
                arguments: z.string().optional()
              })
              .nullish(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number(),
                  id: z.string().nullish(),
                  type: z.literal('function').optional(),
                  function: z.object({
                    name: z.string().nullish(),
                    arguments: z.string().nullish()
                  })
                })
              )
              .nullish()
          })
          .nullish(),
        logprobs: z
          .object({
            content: z
              .array(
                z.object({
                  token: z.string(),
                  logprob: z.number(),
                  top_logprobs: z.array(
                    z.object({
                      token: z.string(),
                      logprob: z.number()
                    })
                  )
                })
              )
              .nullable()
          })
          .nullish(),
        finish_reason: z.string().nullable().optional(),
        index: z.number()
      })
    ),
    usage: z
      .object({
        prompt_tokens: z.number(),
        completion_tokens: z.number()
      })
      .nullish()
  }),
  openAIErrorDataSchema
])

function prepareToolsAndToolChoice({
  mode,
  useLegacyFunctionCalling = false
}: {
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular'
  }
  useLegacyFunctionCalling?: boolean
}) {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined }
  }

  const toolChoice = mode.toolChoice

  if (useLegacyFunctionCalling) {
    const mappedFunctions = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))

    if (toolChoice == null) {
      return { functions: mappedFunctions, function_call: undefined }
    }

    const type = toolChoice.type

    switch (type) {
      case 'auto':
      case 'none':
      case undefined:
        return {
          functions: mappedFunctions,
          function_call: undefined
        }
      case 'required':
        throw new UnsupportedFunctionalityError({
          functionality: 'useLegacyFunctionCalling and toolChoice: required'
        })
      default:
        return {
          functions: mappedFunctions,
          function_call: { name: toolChoice.toolName }
        }
    }
  }

  const mappedTools = tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))

  if (toolChoice == null) {
    return { tools: mappedTools, tool_choice: undefined }
  }

  const type = toolChoice.type

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: mappedTools, tool_choice: type }
    case 'tool':
      return {
        tools: mappedTools,
        tool_choice: {
          type: 'function',
          function: {
            name: toolChoice.toolName
          }
        }
      }
    default: {
      const _exhaustiveCheck: never = type
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`)
    }
  }
}

function combineHeaders(
  ...headerSets: Array<Record<string, string | undefined>>
): Record<string, string> {
  const combinedHeaders: Record<string, string> = {}

  for (const headerSet of headerSets) {
    for (const [key, value] of Object.entries(headerSet)) {
      if (value !== undefined) {
        combinedHeaders[key] = value
      }
    }
  }

  return combinedHeaders
}
