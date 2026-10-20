import CardMode from './ui/CardMode'
import ShutdownNotice from './ui/ShutdownNotice'
export default function App() {
  return (
    <>
      <ShutdownNotice />
      <CardMode onExit={() => { window.location.href = '/' }} />
    </>
  )
}
