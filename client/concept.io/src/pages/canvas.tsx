import { FCanvas } from '../components/FCanvas'
import { ToolProvider } from '../contexts/ToolContext'
import {CanvasProvider, useCanvasContext} from '../contexts/CanvasContext'
import VoiceAssistantRender from '../components/Assistant/VoiceAssistantRender'
import { ErrorBoundary } from '../contexts/ErrorBoundary';

const Canvas = () => {
  return (
      <div className="overflow-hidden no-scrollbar">
          <ToolProvider>
              <ErrorBoundary>
              <CanvasProvider>
                  <VoiceAssistantRender />
                  <FCanvas />

                </CanvasProvider>
              </ErrorBoundary>
          </ToolProvider>
      </div>
   
  )
}

export default Canvas
