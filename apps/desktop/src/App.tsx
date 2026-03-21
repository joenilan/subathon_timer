import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { AppFrame } from './components/AppFrame'
import { RuntimeLifecycle } from './components/RuntimeLifecycle'
import { DashboardPage } from './pages/DashboardPage'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { OverlaysPage } from './pages/OverlaysPage'
import { WheelPage } from './pages/WheelPage'
import { RulesPage } from './pages/RulesPage'
import { SettingsPage } from './pages/SettingsPage'
import { TimerOverlayPage } from './overlays/TimerOverlayPage'
import { ReasonOverlayPage } from './overlays/ReasonOverlayPage'

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
      { path: 'overlays', element: <OverlaysPage /> },
      { path: 'wheel', element: <WheelPage /> },
      { path: 'rules', element: <RulesPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '/overlay/timer', element: <TimerOverlayPage /> },
  { path: '/overlay/reason', element: <ReasonOverlayPage /> },
])

export function App() {
  return (
    <>
      <RuntimeLifecycle />
      <RouterProvider router={router} />
    </>
  )
}
