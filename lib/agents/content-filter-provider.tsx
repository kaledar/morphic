import fs from 'fs/promises'
import path from 'path'
//import { S3 } from 'aws-sdk';
import { Redis } from '@upstash/redis'

// Environment variables for switching between storage mechanisms
const useS3 = process.env.USE_S3 === 'true'
const useFile = process.env.USE_FILE === 'true'
const useRedis = process.env.USE_REDIS === 'true'

// S3 configuration
//const s3 = useS3 ? new S3() : null;
const bucketName = process.env.S3_BUCKET_NAME
const fileName = 'sensitive-terms.json'

// Redis configuration
const redis = useRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
    })
  : null

export interface SensitiveTerms {
  [key: string]: string
}

export class SensitiveTermsLoader {
  private sensitiveTerms: SensitiveTerms = {}

  constructor() {
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
      //const data = await s3!.getObject(params).promise();
      //terms = JSON.parse(data.Body!.toString('utf-8'));
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
  }

  async refreshTerms(): Promise<void> {
    await this.loadTerms()
  }

  public getTerms(): SensitiveTerms {
    return this.sensitiveTerms
  }
}

// Usage
const termsLoader = new SensitiveTermsLoader()

export async function getSensitiveTerms(): Promise<SensitiveTerms> {
  await termsLoader.refreshTerms()
  return termsLoader.getTerms()
}
