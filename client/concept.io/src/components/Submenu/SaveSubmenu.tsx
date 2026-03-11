import {useState} from 'react';
import { Save, Download, type LucideIcon, Camera, Share } from 'lucide-react';
import { useCanvasContext } from '../../contexts/CanvasContext';
import { ShareSubmenu } from './ShareSubmenu';


interface SaveProperty {
    type: string;
    icon: LucideIcon;
    label: string;
    action: () => void;
    keyBind?: string;
}



//Save project upon exit or connection lost
//Automatically save the project every 5 minutes
    //Version history with timestamps and ability to revert to previous versions
//Export options: PNG, JPEG, SVG, PDF
//Share project link or collaborate in real-time with others
const SaveSubmenu = () => {
  const {canvas} = useCanvasContext();
  const [showShareSubmenu, setShowShareSubmenu] = useState(false);

  //automatically triggered based on set durations
  const saveSnapShot = () => {
    if(!canvas) return;
    console.log("Snapshot saved");
    const canvasJson = canvas.toJSON();
    const canvasObject = canvas.toObject();
    localStorage.setItem('canvasData', JSON.stringify(canvasJson));
  };

  //toggle on Snapshot menu, user select which snapshot to load
  const loadSnapShot = () => {
    if(!canvas) return;
    console.log("Snapshot loaded");
    // Logic to load a previously saved snapshot
    const storedJson = localStorage.getItem('canvasData');
    if (storedJson) {
        canvas.loadFromJSON(storedJson, () => {
            canvas.renderAll();
            console.log('Canvas loaded from snapshot');
        });
  }
}


const exportProject = () => {
  if(!canvas) return;
    console.log("Project exported");
    const dataURL = canvas.toDataURL({
    format: 'png',
    quality: 1.0,
    multiplier: 1, 
     });

    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'canvas-image.png';
    link.click();
 
}

  const saveOptions: SaveProperty[] = [
    {
      type: 'save',
      icon: Save,
      label: 'Save',
      action: () => loadSnapShot(),
      keyBind: 'Ctrl+S',
    },
    {
        type: 'export',
        icon: Download,
        label: 'Export',
        action: () => exportProject(),
        keyBind: 'Ctrl+E',
    } ,
    {
      type: 'Snapshot',
      icon: Camera,
      label: 'Snapshot',
      action: () => saveSnapShot(),
      keyBind: 'Ctrl+D',
    },
    {
        type: 'share',
        icon: Share,
        label: 'Share',
        action: () => { console.log('Share action'); setShowShareSubmenu(true); },
        keyBind: 'Ctrl+Shift+S',
      },   

  ];

  return (
    <>
    <div className = "absolute bottom-0 left-0 right-0 bg-white p-2">
        {
            <div className="grid grid-cols-4 gap-8">
                {saveOptions.map((item) => (
                    <button
                        key={item.type}
                        onClick={item.action}
                        className={`p-2 rounded hover:bg-gray-100`}
                        title={item.label}
                    >
                        <item.icon size={20} />
                    </button>
                ))}
            </div> 
             
        }
    </div>
    {showShareSubmenu && <ShareSubmenu />}
    </>

  )
}

export default SaveSubmenu