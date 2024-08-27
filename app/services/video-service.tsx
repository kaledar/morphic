import { VideoSearchResultItem } from '@/lib/types'

type CacheEntry<V> = {
  value: V
  timestamp: number
}

const videoResultsCache: Record<
  string,
  CacheEntry<VideoSearchResultItem[]>
> = {}
const CACHE_DURATION = 10000 // Cache duration in milliseconds (10 seconds)

export async function getVideoResults(
  query: string
): Promise<VideoSearchResultItem[]> {
  //console.log(`getting video results for query: ${query}`)
  const currentTime = Date.now()
  const cacheEntry = videoResultsCache[query]

  // If cache entry exists and is within the cache duration, return the cached value
  if (cacheEntry && currentTime - cacheEntry.timestamp < CACHE_DURATION) {
    //console.log('Returning cached results for query:', query)
    return cacheEntry.value
  }

  // Otherwise, fetch new data, store it in cache, and return it
  const template =
    process.env.RECOMMENDATION_API_URL ||
    'http://localhost:3334/search-videos?searchQuery={query}'

  const url = template.replace('{query}', encodeURIComponent(query))

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    const responseData = await response.json()

    // Store the result in cache
    videoResultsCache[query] = { value: responseData, timestamp: currentTime }

    // console.log(`got video response: ${JSON.stringify(responseData)}`)
    return responseData
  } catch (error) {
    console.error('Failed to fetch videos:', error)
    return []
  }
}
