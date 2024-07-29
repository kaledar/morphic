export type OpenAIChatPrompt = Array<ChatCompletionMessageParam>

export type ChatCompletionMessageParam =
  | ChatCompletionSystemMessageParam
  | ChatCompletionUserMessageParam
  | ChatCompletionAssistantMessageParam
  | ChatCompletionToolMessageParam
  | ChatCompletionFunctionMessageParam

export interface ChatCompletionSystemMessageParam {
  role: 'system'
  content: string
}

export interface ChatCompletionUserMessageParam {
  role: 'user'
  content: string | Array<ChatCompletionContentPart>
}

export type ChatCompletionContentPart =
  | ChatCompletionContentPartText
  | ChatCompletionContentPartImage

export interface ChatCompletionContentPartImage {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export interface ChatCompletionContentPartText {
  type: 'text'
  text: string
}

export interface ChatCompletionAssistantMessageParam {
  role: 'assistant'
  content?: string | null
  tool_calls?: Array<ChatCompletionMessageToolCall>
  /**
   * Legacy function calling interface.
   * @deprecated
   */
  function_call?: {
    arguments: string
    name: string
  }
}

export interface ChatCompletionMessageToolCall {
  type: 'function'
  id: string
  function: {
    arguments: string
    name: string
  }
}

export interface ChatCompletionToolMessageParam {
  role: 'tool'
  content: string
  tool_call_id: string
}

/**
 * Legacy function calling interface.
 *
 * @internal
 * @deprecated
 */
export interface ChatCompletionFunctionMessageParam {
  role: 'function'
  content: string
  name: string
}
