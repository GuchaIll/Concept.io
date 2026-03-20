const InvitationSubmenu = () => {
  return (
    <div>
        <h3>Invitation Link</h3>
        <p>Share this link to invite others to your session:</p>
        <input type="text" readOnly value="https://concept.io/session/12345" className="w-full p-2 border rounded" />
        <button className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Copy Link</button>
    </div>
  )
}

export default InvitationSubmenu