import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ConfirmProvider } from './components/ConfirmDialog'
import { I18nProvider } from './i18n/I18nProvider'
import { ErrorBoundary, ErrorNotice } from './components/ErrorBoundary'

// A number field in focus would take a scroll over it (a wheel, two fingers on a touchpad) as steps up or
// down: the field lets go of the focus instead, so the value stays and the page scrolls on.
document.addEventListener(
  'wheel',
  (event) => {
    const target = event.target
    if (target instanceof HTMLInputElement && target.type === 'number' && target === document.activeElement) target.blur()
  },
  { capture: true, passive: true },
)

// The last resort: whatever fails to draw, the window says so instead of going blank.
const rootTexts = {
  title: 'Не удалось показать страницу',
  stale: 'Пока страница была открыта, вышла новая версия приложения. Обновите страницу, чтобы её получить.',
  other: 'При отрисовке что-то пошло не так. Обновите страницу.',
  reload: 'Обновить страницу',
  retry: 'Попробовать ещё раз',
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={(error) => <ErrorNotice error={error} texts={rootTexts} />}>
      <I18nProvider><ConfirmProvider><App /></ConfirmProvider></I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)
