import { Chat } from '@/components/chat'
import { generateId } from 'ai'
import { AI } from './actions'
import { redirect } from 'next/navigation'
import { FromSingleton } from '@/lib/contexts/from-singleton'

export const maxDuration = 60

export default function Page({
  params,
  searchParams
}: {
  params: { slug?: string[] }
  searchParams: { q?: string; from?: string }
}) {
  const query = searchParams.q
  const from = searchParams.from || 'web'

  FromSingleton.getInstance().from = from

  // Check if the URL is in the format /q=...&from=...
  if (params.slug && params.slug[0]?.startsWith('q=')) {
    const queryString = params.slug.join('/')
    redirect(`/?${queryString}`)
  }

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
