import React, { useEffect, useMemo, useState } from 'react'
import VideoPlayer from './video-player-internal'

type VideoPlayerProps = {
  playlistUrl: string
}

type Playlist = {
  id: string
  title: string
  description: string
  poster: string
  items: PlaylistItem[]
}

type PlaylistItem = {
  src: string
  type: string
  label: string
  width?: number
  height?: number
}

const VideoPlayerController: React.FC<VideoPlayerProps> = ({ playlistUrl }) => {
  const [playlistContent, setPlaylistContent] = useState<Playlist | undefined>()
  const [error, setError] = useState<any>()

  useEffect(() => {
    const fetchPlaylistContent = async () => {
      try {
        const res = await fetch(playlistUrl, {
          cache: 'no-cache'
        })
        const data: Playlist = await res.json()
        setPlaylistContent(data)
      } catch (err) {
        setError(err)
      }
    }

    if (playlistUrl) {
      fetchPlaylistContent()
    }
  }, [playlistUrl])

  const videoJsOptions = useMemo(() => {
    if (!playlistContent) return {}

    const hlsTypes = ['application/x-mpegURL', 'application/vnd.apple.mpegurl']

    // console.log(`playlistContent: ${JSON.stringify(playlistContent)}`)
    const sources = playlistContent.items
      .filter(item => hlsTypes.includes(item.type))
      .map(item => ({
        src: item.src,
        type: item.type,
        label: item.label
      }))

    return {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: true,
      sources: sources.length
        ? sources
        : playlistContent.items.map(item => ({
            src: item.src,
            type: item.type,
            label: item.label
          })),
      poster: playlistContent.poster
    }
  }, [playlistContent])

  return (
    <div>
      {error && <div>{error}</div>}
      {playlistContent && <VideoPlayer options={videoJsOptions} />}
    </div>
  )
}

export default VideoPlayerController
