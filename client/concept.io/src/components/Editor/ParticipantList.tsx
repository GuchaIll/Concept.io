const ParticipantList = () => {

    const participants = [
        { id: 1, name: 'Alice', email: 'alice@example.com', profilePic: '/avatars/cat.png' },
        { id: 2, name: 'Bob', email: 'bob@example.com', profilePic: '/avatars/chicken.png' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com', profilePic: '/avatars/duck.png' },
    ];

  return (
    <div className = "fixed max-h-[240px] overflow-auto flex flex-col top-8 right-48 bg-white shadow-lg rounded-sm z-50">
        <div className = "border-b bg-gray-600 mb-2 text-white w-full text-md p-2 font-bold">
          <h1>Session Members</h1>
        </div>
          {participants.map(participant => (
            <div className = "flex items-center space-x-2 shadow-xl p-2 m-0.5" key={participant.id}>
              {participant.profilePic && <img src={participant.profilePic} alt={participant.name} className = "h-10 w-10" />}
              <span className = "text-sm">
                {participant.name} 
              </span>
            </div>
          ))}
       
    </div>
  )
}

export default ParticipantList;