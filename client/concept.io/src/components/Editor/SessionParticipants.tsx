import {useState} from 'react';
import ParticipantList from './ParticipantList';

const SessionParticipants = () => {

    const [showParticipantsList, setShowParticipantsList] = useState(false);

    const participants = [
        { id: 1, name: 'Alice', email: 'alice@example.com', profilePic: '/avatars/cat.png' },
        { id: 2, name: 'Bob', email: 'bob@example.com', profilePic: '/avatars/chicken.png' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com', profilePic: '/avatars/duck.png' },
    ];

  return (
    <div className = "fixed overflow-auto flex top-0 right-48 rounded-sm z-50">
          {participants.map(participant => (
            <div className = "items-center space-x-2 shadow-xl p-2 m-0.5" key={participant.id}>
              {participant.profilePic && <img src={participant.profilePic} alt={participant.name} className = "h-10 w-10" />}
            </div>
          ))}

        {showParticipantsList && (
            <ParticipantList  />
        )}
       
    </div>
  )
}

export default SessionParticipants;