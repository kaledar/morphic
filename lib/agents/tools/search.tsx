import { tool } from 'ai'
import { createStreamableValue } from 'ai/rsc'
import Exa from 'exa-js'
import { searchSchema } from '@/lib/schema/search'
import { SearchSection } from '@/components/search-section'
import { ToolProps } from '.'
import { SearchResults } from '@/lib/types'

export const searchTool = ({ uiStream, fullResponse, from }: ToolProps) =>
  tool({
    description: 'Search the web for information',
    parameters: searchSchema,
    execute: async ({
      query,
      max_results,
      search_depth,
      include_domains,
      exclude_domains
    }) => {
      console.log(`Executing search...(RA)G`)
      let hasError = false

      // "news" is always included in the domains
      const domainsToInclude = include_domains
        ? [...include_domains, 'news']
        : ['news']
      const uniqueDomains = Array.from(new Set(domainsToInclude))

      // Append the search section
      const streamResults = createStreamableValue<string>()
      uiStream.update(
        <SearchSection
          result={streamResults.value}
          includeDomains={uniqueDomains}
        />
      )

      // Tavily API requires a minimum of 5 characters in the query
      const filledQuery =
        query.length < 5 ? query + ' '.repeat(5 - query.length) : query
      let searchResult

      type SearchAPI = 'tavily' | 'exa' | 'kaledar'
      let searchAPI: SearchAPI = 'tavily' as SearchAPI

      if (from === 'web') {
        searchAPI = 'kaledar' as SearchAPI
      }

      try {
        switch (searchAPI) {
          case 'tavily':
            searchResult = await tavilySearch(
              filledQuery,
              max_results,
              search_depth,
              include_domains,
              exclude_domains
            )
            break
          case 'exa':
            searchResult = await exaSearch(query)
            break
          case 'kaledar':
            searchResult = await getRecommendations(query)
            break
          default:
            throw new Error(`Unsupported search API: ${searchAPI}`)
        }
      } catch (error) {
        console.error('Search API error:', error)
        hasError = true
      }

      if (hasError) {
        fullResponse = `An error occurred while searching for "${query}.`
        uiStream.update(null)
        streamResults.done()
        return searchResult
      }

      streamResults.done(JSON.stringify(searchResult))

      console.log(`search has been done!`)
      return searchResult
    }
  })

async function tavilySearch(
  query: string,
  maxResults: number = 10,
  searchDepth: 'basic' | 'advanced' = 'basic',
  includeDomains: string[] = [],
  excludeDomains: string[] = []
): Promise<any> {
  const apiKey = process.env.TAVILY_API_KEY
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults < 5 ? 5 : maxResults,
      search_depth: searchDepth,
      include_images: true,
      include_answers: true,
      include_domains: includeDomains,
      exclude_domains: excludeDomains
    })
  })

  if (!response.ok) {
    throw new Error(`Error: ${response.status}`)
  }

  const data = await response.json()
  return data
}

async function exaSearch(
  query: string,
  maxResults: number = 10,
  includeDomains: string[] = [],
  excludeDomains: string[] = []
): Promise<any> {
  const apiKey = process.env.EXA_API_KEY
  const exa = new Exa(apiKey)
  return exa.searchAndContents(query, {
    highlights: true,
    numResults: maxResults,
    includeDomains,
    excludeDomains
  })
}

async function getRecommendations(query: string): Promise<SearchResults> {
  const template =
    process.env.RECOMMENDATION_API_URL ||
    'http://localhost:3334/search-news-assets?searchQuery={query}'

  const url = template.replace('{query}', encodeURIComponent(query))

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    const responseData = await response.json()
    return {
      query, // Pass the original query for consistency.
      images: responseData.images,
      results: responseData.results
    }
  } catch (error) {
    console.error('Failed to fetch recommendations:', error)
    return {
      query,
      images: [],
      results: [] // Return empty arrays on error as a safe fallback.
    }
  }
}
