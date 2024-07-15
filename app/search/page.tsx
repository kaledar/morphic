import { Chat } from '@/components/chat'
import { generateId } from 'ai'
import { AI } from '@/app/actions'
import { redirect } from 'next/navigation'
import { FromSingleton } from '@/lib/contexts/from-singleton'

export const maxDuration = 60

export default function Page({
  searchParams
}: {
  searchParams: { q: string; from: string }
}) {
  if (!searchParams.q) {
    redirect('/')
  }
  const id = generateId()

  FromSingleton.getInstance().from = searchParams.from

  return (
    <AI initialAIState={{ chatId: id, messages: [] }}>
      <Chat id={id} query={searchParams.q} from={searchParams.from} />
    </AI>
  )
}
