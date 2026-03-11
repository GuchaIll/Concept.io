import { FCanvas } from '../components/FCanvas'
import { ToolProvider } from '../contexts/ToolContext'
import {CanvasProvider} from '../contexts/CanvasContext'
import { AssetProvider } from '../contexts/AssetContext'
import { useSession } from '../contexts/SessionContext'
import VoiceAssistantRender from '../components/Assistant/VoiceAssistantRender'


const Canvas = () => {
  const { projectId, userId } = useSession();

  return (
      <div className="overflow-hidden no-scrollbar">
          <ToolProvider>
              <CanvasProvider>
                  <AssetProvider projectId={projectId} userId={userId}>
                      <VoiceAssistantRender />
                      <FCanvas />
                  </AssetProvider>
              </CanvasProvider>
          </ToolProvider>
      </div>
   
  )
}

export default Canvas
