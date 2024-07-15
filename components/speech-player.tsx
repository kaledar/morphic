import React, { useState, useRef, useEffect } from 'react'
import { fetchSpeechAudio } from '@/app/services/audio-service'
import { FaPlay, FaPause, FaStop } from 'react-icons/fa'
import { Button } from '@/components/ui/button'

type SpeechPlayerProps = {
  text: string
}

const SpeechPlayer: React.FC<SpeechPlayerProps> = ({ text }) => {
  const [loading, setLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  const handleFetchAudio = async () => {
    if (isPlaying) return
    setLoading(true)
    try {
      const response = await fetchSpeechAudio(text)
      const arrayBuffer = await response.arrayBuffer()
      await decodeAndPlayAudio(arrayBuffer)
    } catch (error: any) {
      console.error('Error fetching or playing audio:', error)
    } finally {
      setLoading(false)
    }
  }

  const decodeAndPlayAudio = async (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    const audioContext = audioContextRef.current

    try {
      audioBufferRef.current = await audioContext.decodeAudioData(arrayBuffer)
      playAudio()
    } catch (error) {
      console.error('Error decoding audio data:', error)
      throw new Error('Failed to decode audio data')
    }
  }

  const playAudio = () => {
    if (!audioContextRef.current || !audioBufferRef.current) return

    sourceNodeRef.current = audioContextRef.current.createBufferSource()
    sourceNodeRef.current.buffer = audioBufferRef.current
    sourceNodeRef.current.connect(audioContextRef.current.destination)
    sourceNodeRef.current.start()
    setIsPlaying(true)

    sourceNodeRef.current.onended = () => {
      setIsPlaying(false)
    }
  }

  const pauseAudio = () => {
    if (audioContextRef.current) {
      audioContextRef.current.suspend()
      setIsPlaying(false)
    }
  }

  const resumeAudio = () => {
    if (audioContextRef.current) {
      audioContextRef.current.resume()
      setIsPlaying(true)
    }
  }

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop()
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = new AudioContext()
    }
    sourceNodeRef.current = null
    audioBufferRef.current = null
    setIsPlaying(false)
  }

  return (
    <div className="flex items-center space-x-2">
      {loading ? (
        <Button disabled>
          <FaPlay className="mr-2 h-4 w-4" /> Loading...
        </Button>
      ) : isPlaying ? (
        <>
          <Button onClick={pauseAudio}>
            <FaPause className="mr-2 h-4 w-4" /> Pause
          </Button>
          <Button onClick={stopAudio}>
            <FaStop className="mr-2 h-4 w-4" /> Stop
          </Button>
        </>
      ) : (
        <Button
          onClick={audioBufferRef.current ? resumeAudio : handleFetchAudio}
        >
          <FaPlay className="mr-2 h-4 w-4" />{' '}
          {audioBufferRef.current ? 'Resume' : 'Play'}
        </Button>
      )}
    </div>
  )
}

export default SpeechPlayer
