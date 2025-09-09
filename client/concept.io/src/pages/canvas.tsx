import { FCanvas } from '../components/FCanvas'
import { ToolProvider } from '../contexts/ToolContext'
import {CanvasProvider} from '../contexts/CanvasContext'

const Canvas = () => {
  return (
    <ToolProvider>
      <CanvasProvider>
        <div className="w-full h-full">
          <FCanvas />
        </div>
      </CanvasProvider>
    </ToolProvider>
  )
}

export default Canvas