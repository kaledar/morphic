import HistoryContainer from './history-container'

export async function Sidebar() {
  return (
    // TODO: arrange according to screen sizes and make visible
    //<div className="h-screen p-2 fixed top-0 right-0 flex-col justify-center pb-24 hidden sm:flex">
    <div className="h-screen p-2 fixed top-0 right-0 flex-col justify-center pb-24 md:flex">
      <HistoryContainer location="sidebar" />
    </div>
  )
}
