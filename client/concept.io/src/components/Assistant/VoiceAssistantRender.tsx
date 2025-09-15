import {useState} from 'react';

const VoiceAssistantRender: React.FC = () => {
    const [isAssistantVisible, setAssistantVisible] = useState(true);
    const [isInteracting, setIsInteracting] = useState(false);
    const [assistantSize, setAssistantSize] = useState<'small' | 'medium' | 'large'>('medium');

    const interactWithAssistant = () => {
        // Logic to interact with the voice assistant
        console.log("Interacting with Voice Assistant");
    };

  return (
    <div className = "flex flex-col absolute bottom-2 right-0">
      <h1>Voice Assistant</h1>
      <img src="VoiceAssistant/frog_va_transparent.png" alt="Voice Assistant" className = "h-24 w-24 z-50"  />
    </div>
  );
};

export default VoiceAssistantRender;
