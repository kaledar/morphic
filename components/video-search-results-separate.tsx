'use client'

import React, { useState, useEffect } from 'react'
import { PlusCircle } from 'lucide-react'
import { VideoSearchResultItem } from '@/lib/types'
import VideoPlayerController from './video-player'

export interface VideoSearchResultsProps {
  results: VideoSearchResultItem[]
}

export function VideoSearchResultsSeparate({
  results
}: VideoSearchResultsProps) {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
  const [videos, setVideos] = useState<VideoSearchResultItem[]>([])

  useEffect(() => {
    if (results && results.length > 0) {
      const filteredVideos = results.filter(video => video)
      setVideos(filteredVideos)
      setSelectedVideo(filteredVideos[0]?.playlistUrl || null)
    }
  }, [results])

  if (!videos || videos.length === 0) {
    return <div>No videos found</div>
  }

  return (
    <div className="space-y-4">
      <div className="aspect-video">
        {selectedVideo ? (
          <VideoPlayerController playlistUrl={selectedVideo} />
        ) : (
          <p>No video selected</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {videos.slice(0, 4).map(result => {
          const imageUrl = `${result.baseUrl}${result.imageUrl}`
          return (
            <div
              key={result.videoId}
              className="cursor-pointer"
              onClick={() => setSelectedVideo(result.playlistUrl)}
            >
              <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
                <img
                  src={imageUrl}
                  alt={result.title}
                  className="object-cover"
                  onError={e => {
                    ;(e.currentTarget as HTMLImageElement).src =
                      '/images/placeholder-image.png'
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 opacity-0 transition-opacity hover:opacity-100">
                  <PlusCircle className="h-12 w-12 text-white" />
                </div>
              </div>
              <h3 className="mt-2 text-sm font-medium">{result.title}</h3>
              <p className="text-xs text-muted-foreground">
                {new URL(result.playlistUrl).hostname}
              </p>
            </div>
          )
        })}
        {videos.length > 4 && (
          <div className="flex items-center justify-center">
            <span className="text-sm text-muted-foreground">
              +{videos.length - 4} more
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
