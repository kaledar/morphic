import { createStreamableUI } from 'ai/rsc'
import { retrieveTool } from './retrieve'
import { searchTool } from './search'
import { videoSearchTool } from './video-search'

export interface ToolProps {
  uiStream: ReturnType<typeof createStreamableUI>
  fullResponse: string
  from: string
}

export const getTools = ({ uiStream, fullResponse, from }: ToolProps) => {
  const tools: any = {
    search: searchTool({
      uiStream,
      fullResponse,
      from
    }),
    retrieve: retrieveTool({
      uiStream,
      fullResponse,
      from
    })
  }

  if (process.env.SERPER_API_KEY) {
    tools.videoSearch = videoSearchTool({
      uiStream,
      fullResponse,
      from
    })
  }

  return tools
}
