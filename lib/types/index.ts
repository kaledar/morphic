export type SearchResults = {
  images: string[]
  results: SearchResultItem[]
  query: string
}

export type ExaSearchResults = {
  results: ExaSearchResultItem[]
}

export type SerperSearchResults = {
  searchParameters: {
    q: string
    type: string
    engine: string
  }
  videos: SerperSearchResultItem[]
}

export type SearchResultItem = {
  title: string
  url: string
  content: string
}

export type ExaSearchResultItem = {
  score: number
  title: string
  id: string
  url: string
  publishedDate: Date
  author: string
}

export type SerperSearchResultItem = {
  title: string
  link: string //video link with videoId something
  snippet: string
  imageUrl: string
  duration: string
  source: string
  channel: string //metadata, youtube channel info displayed in alt of avatar
  date: string
  position: number
}

export type VideoSearchResultList = {
  videos: VideoSearchResultItem[]
}

export type VideoSearchResultItem = {
  assetId: string
  videoId: string
  baseUrl: string
  s3Key: string
  playlistUrl: string
  type: string
  title: string
  snippet: string
  imageUrl: string
  duration: string
  source: string
  channel: string //metadata, youtube channel info displayed in alt of avatar
  date: string
  position: number
}

export interface Chat extends Record<string, any> {
  id: string
  title: string
  createdAt: Date
  userId: string
  path: string
  messages: AIMessage[]
  sharePath?: string
}

export type AIMessage = {
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool'
  content: string
  id: string
  name?: string
  type?:
    | 'answer'
    | 'related'
    | 'skip'
    | 'inquiry'
    | 'input'
    | 'input_related'
    | 'tool'
    | 'followup'
    | 'end'
}
