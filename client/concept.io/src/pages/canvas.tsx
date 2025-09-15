import { FCanvas } from '../components/FCanvas'
import { ToolProvider } from '../contexts/ToolContext'
import {CanvasProvider, useCanvasContext} from '../contexts/CanvasContext'
import VoiceAssistantRender from '../components/Assistant/VoiceAssistantRender'


const Canvas = () => {
  return (
    <ToolProvider>
      <CanvasProvider>
          <VoiceAssistantRender />
          <FCanvas />

      </CanvasProvider>
    </ToolProvider>
  )
}

export default Canvas
