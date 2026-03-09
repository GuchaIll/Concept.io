export const ShareSubmenu = () => {

  const getSessionInviteLink = () => {
    const roomId = window.location.pathname.split('/').pop() || 'default-room';
    const inviteLink = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      console.log('Invite link copied to clipboard:', inviteLink);
    }).catch(err => {
      console.error('Failed to copy invite link:', err);
    });
  }

  return (
    <div className="fixed -bottom-0 right-8 -translate-y-1/2 max-w-[220px]  ml-2 bg-white rounded-lg shadow-xl p-3 space-y-4 dark:bg-gray-800">
      <div className="space-y-2 mb-0">
        <button
          onClick={getSessionInviteLink}
          className={`w-full p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700`}
        >
          Copy Invite Link
        </button>
      </div>
    </div>
  )
}
