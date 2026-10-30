import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installBridge } from './bridge'
import './styles.css'

// 组件在模块顶层读取 window.markgo，需先装好桥接再加载界面
installBridge()
  .then(() => import('./App'))
  .then(({ App }) =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  )
