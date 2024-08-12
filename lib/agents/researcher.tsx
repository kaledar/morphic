import { createStreamableUI, createStreamableValue } from 'ai/rsc'
import { CoreMessage, ToolCallPart, ToolResultPart, streamText } from 'ai'
import { getTools } from './tools'
import { getModel, transformToolMessages } from '../utils'
import { AnswerSection } from '@/components/answer-section'
import { ModeToggle } from '../../components/mode-toggle'

export async function researcher(
  uiStream: ReturnType<typeof createStreamableUI>,
  streamableText: ReturnType<typeof createStreamableValue<string>>,
  messages: CoreMessage[],
  from: string | null
) {
  //console.log(`messages...:${JSON.stringify(messages)}`)
  let fullResponse = ''
  let hasError = false
  let finishReason = ''

  // Transform the messages if using Ollama provider
  let processedMessages = messages
  const useOllamaProvider = !!(
    process.env.OLLAMA_MODEL && process.env.OLLAMA_BASE_URL
  )
  //if (useOllamaProvider) {
  if (true) {
    processedMessages = transformToolMessages(messages) //This is required in our case!!
  }
  const includeToolResponses = messages.some(message => message.role === 'tool')
  const useSubModel = useOllamaProvider && includeToolResponses

  const streambleAnswer = createStreamableValue<string>('')
  const answerSection = <AnswerSection result={streambleAnswer.value} />

  const currentDate = new Date().toLocaleString()
  const result = await streamText({
    model: getModel(useSubModel),
    maxTokens: 2500,
    system: `As a trained and fine tuned assistant model, summarize tool results accoding to TRT's guidelines, policies and sensitiveness. 
    If the user query's context is in the sensitive content you have trained for, then just refuse to answer in a polite way.`,
    messages: processedMessages,
    tools: getTools({
      uiStream,
      fullResponse,
      from
    }),
    toolChoice: 'required',
    onFinish: async event => {
      console.log(`researcher: streamText has been finished..`)
      finishReason = event.finishReason
      fullResponse = event.text
      streambleAnswer.done()
    }
  }).catch((err: Error) => {
    console.log(`researcher: streamText error: ${err.stack}`)
    hasError = true
    fullResponse = 'Error: ' + err.message
    streamableText.update(fullResponse)
  })

  // If the result is not available, return an error response
  if (!result) {
    console.log(`researcher: no results.`)
    return { result, fullResponse, hasError, toolResponses: [] }
  }

  const hasToolResult = messages.some(message => message.role === 'tool')
  if (hasToolResult) {
    console.log(`researcher: has tool result`)
    uiStream.append(answerSection)
  }

  // Process the response
  console.log(`researcher: processing the response: ${JSON.stringify(result)}`)

  const toolCalls: ToolCallPart[] = []
  const toolResponses: ToolResultPart[] = []
  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta':
        //console.log(`researcher: result is text-delta`)
        if (delta.textDelta) {
          fullResponse += delta.textDelta
          if (hasToolResult) {
            streambleAnswer.update(fullResponse)
          } else {
            streamableText.update(fullResponse)
          }
        }
        break
      case 'tool-call':
        console.log(`researcher: result is tool-call`)
        toolCalls.push(delta)
        break
      case 'tool-result':
        console.log(`researcher: result is tool-result`)
        if (!delta.result) {
          hasError = true
        }
        toolResponses.push(delta)
        break
      case 'error':
        console.log('researcher result Error: ' + delta.error)
        hasError = true
        fullResponse += `\nError occurred while executing the tool`
        break
    }
  }
  messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: fullResponse }, ...toolCalls]
  })

  if (toolResponses.length > 0) {
    // Add tool responses to the messages
    messages.push({ role: 'tool', content: toolResponses })
  }

  return { result, fullResponse, hasError, toolResponses, finishReason }
}
