

interface MessageEntryProps
{
    sentBy?: string,
    user: string,
    content: string,
    timestamp: number,
    userProfile: string
}

const MessageEntry: React.FC<MessageEntryProps> = (
    {
        sentBy,
        user,
        content,
        timestamp,
        userProfile
        
    }
) =>
{
    return  <div className = {`flex min-w-[200px] ${user !== sentBy ? 'justify-start ' : 'justify-end'}`}>
                <div className={`flex p-2 rounded-lg max-w-xs content-center ${user !== sentBy ? 'bg-gray-200' : 'bg-blue-400'}`}>
                    < div className = "flex flex-col p-0 ">
                        <img src = {userProfile} className = "w-8 h-8" alt = "profile image"/>
                        <span className = "text-xs text-gray-400">{timestamp} </span>
                        <span className = "text-xs text-bold text-gray-500">{sentBy}</span>
                    </div>
                    <div className = "flex flex-col p-0 justify-center">
                        <p className="text-xs text-center">{content}</p>
                    </div>
                        
                </div>
            </div>

}

export default MessageEntry