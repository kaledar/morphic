export const fetchSpeechAudio = async (text: string): Promise<Response> => {
  const url = 'http://localhost:3334/text-to-speech'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  })

  if (!response.ok) {
    throw new Error('Network response was not ok')
  }

  return response
}
