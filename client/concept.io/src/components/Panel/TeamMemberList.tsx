

const TeamMembers = [
    {name: "John", role: "Project Manager", avatar: "https://picsum.photos/200/300"},
    {name: "Jane", role: "Designer", avatar: "https://picsum.photos/200/300"},
    {name: "Jill", role: "Sound Designer", avatar: "https://picsum.photos/200/300"}
]
const TeamMemberList = () => {
    return <>
        <div className = "flex gap-2">
            {
                TeamMembers.map(member => (
                    <div className = "flex flex-col items-center justify-center gap-2">
                        <img src={member.avatar} alt={member.name} className = "w-16 h-16 rounded-full" />
                        <h2 className = "text-md">{member.name}</h2>
                        <p className = "text-sm">{member.role}</p>
                    </div>
                ))
            }
        </div>
    </>
}

export default TeamMemberList