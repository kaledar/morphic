import React from 'react'
import { History } from './history'
import { HistoryList } from './history-list'

type HistoryContainerProps = {
  location: 'sidebar' | 'header'
}

const HistoryContainer: React.FC<HistoryContainerProps> = async ({
  location
}) => {
  return (
    // To make the history container visible
    // TODO: Fix accordingly
    //<div
    //  className={location === 'header' ? 'block sm:hidden' : 'hidden sm:block'}
    //>
    <div>
      <History location={location}>
        <HistoryList userId="anonymous" />
      </History>
    </div>
  )
}

export default HistoryContainer
