import { Chat } from '@/components/chat'
import { generateId } from 'ai'
import { AI } from './actions'
import { redirect } from 'next/navigation'

export const maxDuration = 60

export default function Page({
  params,
  searchParams
}: {
  params: { slug?: string[] }
  searchParams: { q?: string; from?: string }
}) {
  // Check if the URL is in the format /q=...&from=...
  if (params.slug && params.slug[0]?.startsWith('q=')) {
    const queryString = params.slug.join('/')
    redirect(`/?${queryString}`)
  }

  const query = searchParams.q
  const from = searchParams.from || 'web'

  // If there's a query parameter, redirect to the search page
  if (query) {
    const encodedQuery = encodeURIComponent(query)
    redirect(`/search?q=${encodedQuery}&from=${from}`)
  }

  // If no query parameter, render the default Chat component
  const id = generateId()
  return (
    <AI initialAIState={{ chatId: id, messages: [] }}>
      <Chat id={id} query="" from={from} />
    </AI>
  )
}
