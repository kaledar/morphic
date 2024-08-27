'use client'

import { useEffect, useState } from 'react'
import { SearchSkeleton } from './search-skeleton'
import { Section } from './section'
import { VideoSearchResultItem } from '@/lib/types'
import { getVideoResults } from '@/app/services/video-service'
import { VideoSearchResultsSeparate } from './video-search-results-separate'

export type VideoSearchSectionProps = {
  query: string
}

export function VideoSearchSectionSeparate({ query }: VideoSearchSectionProps) {
  const [results, setResults] = useState<VideoSearchResultItem[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchVideoResults = async () => {
      try {
        setLoading(true)
        const videos = await getVideoResults(query)
        setResults(videos)
      } catch (err) {
        setError('Failed to fetch video results')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchVideoResults()
  }, [query])

  if (loading) {
    return (
      <Section>
        <SearchSkeleton />
      </Section>
    )
  }

  if (error) {
    return (
      <Section>
        <p>{error}</p>
      </Section>
    )
  }

  return (
    <Section>
      {results && results.length > 0 ? (
        <VideoSearchResultsSeparate results={results} />
      ) : (
        <p>No videos found</p>
      )}
    </Section>
  )
}
