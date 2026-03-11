import { FCanvas } from '../components/FCanvas'
import { ToolProvider } from '../contexts/ToolContext'
import {CanvasProvider} from '../contexts/CanvasContext'
import VoiceAssistantRender from '../components/Assistant/VoiceAssistantRender'


const Canvas = () => {
  return (
      <div className="overflow-hidden no-scrollbar">
          <ToolProvider>
              <CanvasProvider>
                  <VoiceAssistantRender />
                  <FCanvas />
              </CanvasProvider>
          </ToolProvider>
      </div>
   
  )
}

export default Canvas
