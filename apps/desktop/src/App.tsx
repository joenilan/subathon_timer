import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { AppFrame } from './components/AppFrame'
import { RuntimeLifecycle } from './components/RuntimeLifecycle'
import { DashboardPage } from './pages/DashboardPage'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { OverlaysPage } from './pages/OverlaysPage'
import { WheelPage } from './pages/WheelPage'
import { RulesPage } from './pages/RulesPage'
import { SettingsPage } from './pages/SettingsPage'
import { AboutPage } from './pages/AboutPage'
import { SharedSessionPage } from './pages/SharedSessionPage'
import { TimerOverlayPage } from './overlays/TimerOverlayPage'
import { ReasonOverlayPage } from './overlays/ReasonOverlayPage'
import { WheelOverlayPage } from './overlays/WheelOverlayPage'

// Layout wrapper
const RootLayout = () => {
  return (
    <AppFrame>
      <Outlet />
    </AppFrame>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'connections', element: <ConnectionsPage /> },
      { path: 'shared-session', element: <SharedSessionPage /> },
      { path: 'overlays', element: <OverlaysPage /> },
      { path: 'wheel', element: <WheelPage /> },
      { path: 'rules', element: <RulesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'about', element: <AboutPage /> },
    ],
  },
  { path: '/overlay/timer', element: <TimerOverlayPage /> },
  { path: '/overlay/reason', element: <ReasonOverlayPage /> },
  { path: '/overlay/wheel', element: <WheelOverlayPage /> },
])

export function App() {
  return (
    <>
      <RuntimeLifecycle />
      <RouterProvider router={router} />
    </>
  )
}
