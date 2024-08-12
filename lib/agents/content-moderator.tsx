import { CoreMessage, CoreUserMessage, UserContent } from 'ai'
import Filter from 'bad-words'
import nlp from 'compromise'
import fs from 'fs/promises'
import path from 'path'
//import { S3 } from 'aws-sdk'
import { Redis } from '@upstash/redis'

// Environment variables for switching between storage mechanisms
const useS3 = process.env.USE_S3 === 'true'
const useFile = process.env.USE_FILE === 'true'
const useRedis = process.env.USE_REDIS === 'true'

// S3 configuration
//const s3 = useS3 ? new S3() : null
const bucketName = process.env.S3_BUCKET_NAME
const fileName = 'sensitive-terms.json'

// Redis configuration
const redis = useRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
    })
  : null

interface SensitiveTerms {
  [key: string]: string
}

class DynamicFilter extends Filter {
  private sensitiveTerms: SensitiveTerms = {}

  constructor() {
    super()
    this.loadTerms() // Note: This is now fire-and-forget
  }

  private async loadTerms(): Promise<void> {
    let terms: SensitiveTerms = {}

    if (useS3) {
      const params = {
        Bucket: bucketName!,
        Key: fileName
      }
      console.log(`Not implemented yet!`)
      //const data = await s3!.getObject(params).promise()
      //terms = JSON.parse(data.Body!.toString('utf-8'))
    } else if (useFile) {
      const filePath =
        process.env.NODE_ENV === 'production'
          ? '/etc/your-app-name/sensitive-terms.json'
          : path.join(process.cwd(), 'sensitive-terms.json')

      console.log(
        `Loading content filtering terms from a persistent file: ${filePath}`
      )

      try {
        const termsJson = await fs.readFile(filePath, 'utf-8')
        terms = JSON.parse(termsJson)

        console.log(`Loaded terms are: ${termsJson}`)
      } catch (error) {
        console.error(`Error loading sensitive terms: ${error}`)
        // Optionally, you might want to use a default set of terms or throw an error
      }
    } else if (useRedis) {
      terms = (await redis!.hgetall('sensitive_terms')) ?? {}
    }

    this.sensitiveTerms = terms
    this.addWords(...Object.keys(terms))
  }

  clean(text: string): string {
    let cleanedText = text

    Object.entries(this.sensitiveTerms).forEach(([term, replacement]) => {
      const regex = new RegExp(`\\b${this.escapeRegExp(term)}\\b`, 'gi')
      cleanedText = cleanedText.replace(regex, replacement)
    })

    console.log(`cleanedText: ${cleanedText}`)

    const doc = nlp(cleanedText)

    doc.normalize({
      whitespace: true, // remove extra whitespace
      case: true, // convert to lowercase
      punctuation: true, // remove punctuation
      unicode: true, // convert unicode characters
      contractions: true, // expand contractions
      acronyms: true, // expand acronyms
      parentheses: true, // remove parentheses
      quotations: true // standardize quotation marks
    })

    Object.entries(this.sensitiveTerms).forEach(([sensitive, replacement]) => {
      doc
        .match(`#Acronym{${sensitive}}`)
        .concat(doc.match(sensitive, 'fuzzy'))
        .replaceWith(replacement)
    })

    const moderated = doc.text()

    if (moderated !== text) {
      console.log(`Original text: ${text}`)
      console.log(`Moderated text: ${moderated}`)
    }

    return moderated
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  async refreshTerms(): Promise<void> {
    await this.loadTerms()
  }
}

const filter = new DynamicFilter()

function moderateUserContent(content: UserContent): UserContent {
  if (Array.isArray(content)) {
    return content.map(part => {
      if ('text' in part) {
        return { ...part, text: filter.clean(part.text) }
      }
      return part
    })
  }
  return filter.clean(content)
}

export async function contentModerationMiddleware(
  messages: CoreMessage[]
): Promise<CoreMessage[]> {
  await filter.refreshTerms()

  return messages.map(message => {
    if (message.role === 'user') {
      console.log(`Moderating user content: ${JSON.stringify(message)}`)
      ;(message as CoreUserMessage).content = moderateUserContent(
        (message as CoreUserMessage).content
      )
    }
    console.log(`Moderated message: ${JSON.stringify(message)}`)
    return message
  })
}
