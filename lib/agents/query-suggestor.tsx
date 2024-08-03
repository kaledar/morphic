import { createStreamableUI, createStreamableValue } from 'ai/rsc'
import { CoreMessage, streamObject } from 'ai'
import { PartialRelated, relatedSchema } from '@/lib/schema/related'
import SearchRelated from '@/components/search-related'
import { getModel } from '../utils'

export async function querySuggestor(
  uiStream: ReturnType<typeof createStreamableUI>,
  messages: CoreMessage[]
) {
  const objectStream = createStreamableValue<PartialRelated>()
  uiStream.append(<SearchRelated relatedQueries={objectStream.value} />)

  const openaiAssistantId = process.env.OPENAI_ASSISTANT_ID
  let lastMessages
  if (!openaiAssistantId) {
    // We'll keep this false for now to always use the new logic
    // Original logic
    lastMessages = messages.slice(-1).map(message => {
      return {
        ...message,
        role: 'user'
      }
    }) as CoreMessage[]
  } else {
    // New logic: Find the first user message
    const userMessage = messages.find(message => message.role === 'user')

    if (userMessage) {
      lastMessages = [userMessage] as CoreMessage[]
    } else {
      // Fallback in case no user message is found
      console.warn('No user message found in the conversation history.')
      lastMessages = [] as CoreMessage[]
    }
  }

  let finalRelatedQueries: PartialRelated = {}
  await streamObject({
    model: getModel(),
    system: `As a professional web researcher, your task is to generate a set of three queries that explore the subject matter more deeply, building upon the initial query and the information uncovered in its search results.

    For instance, if the original query was "Starship's third test flight key milestones", your output should follow this format:

    "{
      "related": [
        "What were the primary objectives achieved during Starship's third test flight?",
        "What factors contributed to the ultimate outcome of Starship's third test flight?",
        "How will the results of the third test flight influence SpaceX's future development plans for Starship?"
      ]
    }"

    Aim to create queries that progressively delve into more specific aspects, implications, or adjacent topics related to the initial query. The goal is to anticipate the user's potential information needs and guide them towards a more comprehensive understanding of the subject matter.
    Please match the language of the response to the user's language.`,
    messages: lastMessages,
    schema: relatedSchema
  })
    .then(async result => {
      for await (const obj of result.partialObjectStream) {
        if (obj.items) {
          objectStream.update(obj)
          finalRelatedQueries = obj
        }
      }
    })
    .finally(() => {
      objectStream.done()
    })

  return finalRelatedQueries
}
