import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { createOllama } from 'ollama-ai-provider'
import { createOpenAI } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { anthropic } from '@ai-sdk/anthropic'
import { CoreMessage } from 'ai'
import { OpenAIAssistantLanguageModel } from './openai-assistant-language-model'
import { SimpleOpenAIAssistantLanguageModel } from './simple-assistant-language-model'
import { Yet1OpenAIAssistantLanguageModel } from './yet-another-custom-model1'
import { Yet2OpenAIAssistantLanguageModel } from './yet2-another-custom-model2'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getModel(useSubModel = false) {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL + '/api'
  const ollamaModel = process.env.OLLAMA_MODEL
  const ollamaSubModel = process.env.OLLAMA_SUB_MODEL
  const openaiApiBase = process.env.OPENAI_API_BASE
  const openaiApiKey = process.env.OPENAI_API_KEY
  let openaiApiModel = process.env.OPENAI_API_MODEL || 'gpt-4o'
  const openaiAssistantId = process.env.OPENAI_ASSISTANT_ID || 'assistantId'
  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY

  if (
    !(ollamaBaseUrl && ollamaModel) &&
    !openaiApiKey &&
    !googleApiKey &&
    !anthropicApiKey
  ) {
    throw new Error(
      'Missing environment variables for Ollama, OpenAI, Google or Anthropic'
    )
  }
  // Ollama
  if (ollamaBaseUrl && ollamaModel) {
    const ollama = createOllama({ baseURL: ollamaBaseUrl })

    if (useSubModel && ollamaSubModel) {
      return ollama(ollamaSubModel)
    }

    return ollama(ollamaModel)
  }

  if (googleApiKey) {
    return google('models/gemini-1.5-pro-latest')
  }

  if (anthropicApiKey) {
    return anthropic('claude-3-5-sonnet-20240620')
  }

  // Fallback to OpenAI instead
  if (openaiApiKey && openaiAssistantId) {
    console.log(`openai assistant is being used!`)
    try {
      return new Yet2OpenAIAssistantLanguageModel(
        openaiApiKey,
        openaiAssistantId
      )
    } catch (err) {
      console.log(err)
    }
    /*
    return new SimpleOpenAIAssistantLanguageModel(
      openaiApiKey,
      openaiAssistantId
    )
      */
    /*
    return new OpenAIAssistantLanguageModel(
      openaiApiModel,
      {},
      {
        provider: 'openai',
        compatibility: 'compatible',
        headers: () => ({
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }),
        url: ({ modelId, path }) => `https://api.openai.com/v1${path}`
      },
      openaiAssistantId
    )
      */
  }

  // Fallback to standard OpenAI chat model if Assistant ID is not provided
  if (openaiApiKey) {
    const openai = createOpenAI({
      baseURL: openaiApiBase,
      apiKey: openaiApiKey,
      organization: ''
    })
    return openai.chat(openaiApiModel)
  }

  /*

  const openai = createOpenAI({
    baseURL: openaiApiBase, // optional base URL for proxies etc.
    apiKey: openaiApiKey, // optional API key, default to env property OPENAI_API_KEY
    organization: '' //, // optional organization
    //headers: {
    //  'OpenAI-Assistant-Id': openaiAssistantId // Add assistant ID in headers
    //}
  })

  return openai.chat(openaiApiModel) //this is used as an underlying agent for the web search.
  */
}

/**
 * Takes an array of AIMessage and modifies each message where the role is 'tool'.
 * Changes the role to 'assistant' and converts the content to a JSON string.
 * Returns the modified messages as an array of CoreMessage.
 *
 * @param aiMessages - Array of AIMessage
 * @returns modifiedMessages - Array of modified messages
 */
export function transformToolMessages(messages: CoreMessage[]): CoreMessage[] {
  return messages.map(message =>
    message.role === 'tool'
      ? {
          ...message,
          role: 'assistant',
          content: JSON.stringify(message.content),
          type: 'tool'
        }
      : message
  ) as CoreMessage[]
}
