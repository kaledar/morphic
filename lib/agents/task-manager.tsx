import { CoreMessage, generateObject } from 'ai'
import { nextActionSchema } from '../schema/next-action'
import { getModel } from '../utils'
import { contentModerationMiddleware } from './content-moderator'
import { getSensitiveTerms } from './content-filter-provider'

// Decide whether inquiry is required for the user input
export async function taskManager(messages: CoreMessage[]) {
  //const moderatedMessages = await contentModerationMiddleware(messages)
  const replacementMap = await getSensitiveTerms()
  console.log(replacementMap) // Use this map in your moderation logic
  try {
    const result = await generateObject({
      //role: user & content: actual text in the 'messages'
      model: getModel(), //getting the underlying model: model is openai
      system: `
        You are a professional web researcher tasked with understanding the user's query and gathering the necessary information through web searches. However, before proceeding, it's crucial to ensure that the user-generated content is appropriate, adheres to community guidelines, and respects the cultural and regional or terror sensitivities of Turkey.
To achieve this, you must first analyze the user's input and determine the best course of action. You have two options: "proceed" or "inquire."
Follow these steps to decide which option to take:

Step 1: Content Moderation

BLOCK CATEGORY: Identify and moderate content that contains offensive language, hate speech, sensitive political topics, explicit content, or any form of discrimination and more importantly Turkey's security concerns and Turkey's policies.
You are also provided with a block list of specific phrases or terms that are sensitive. 
These terms are mapped in the provided JSON and should be evaluated contextually, considering synonyms, acronyms, or similar phrases.
Action: Replace any sensitive terms with safer alternatives using the following replacements:
${JSON.stringify(replacementMap, null, 2)}

After performing the necessary replacements, proceed to Step 2. In most cases, you should select the "inquire" option to gather more information or confirm the content with the user.

Step 2: Task Decision
"proceed": Choose this option if the provided information is sufficient, the content is appropriate, and you can address the query effectively without further clarification.
"inquire": Choose this option if additional information from the user could enhance your ability to provide a more comprehensive and contextually appropriate response. Present a form to the user with default selections or free-form input fields to gather the required details.

Your decision should carefully consider the context, the appropriateness of the content, and whether additional information could improve the quality and relevance of your response. 
Always prioritize content moderation and, when in doubt, lean towards the "inquire" option to ensure your response is accurate, appropriate, and valuable to the user.
Please match the language of the response to the user's language used in the queries and prompts.      
`,
      //moderatedMessages,
      messages,
      schema: nextActionSchema // inquire or proceed
    })

    return result
  } catch (error) {
    console.error(error)
    return null
  }
}
