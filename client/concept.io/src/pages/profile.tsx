
import {useState} from 'react';
import ProfileHeader from "../components/Panel/ProfileHeader";
import TaskList from "../components/Panel/TaskList";
import RoleList from "../components/Panel/RoleList";
import CalendarPanel from "../components/Panel/CalendarPanel"
import UserSettings from "../components/Panel/UserSettings";
import FilestorageSettings from "../components/Panel/FileStorageSettings";
import TeamMemberList from "../components/Panel/TeamMemberList";
const Profile = () => {
    const [activeView, setActiveView] = useState<'tasks' | 'calendar' | 'settings' | 'files'>('tasks');
    
    const renderContent = () =>
    {
        switch(activeView) {
            case 'tasks':
                return <div className = "flex flex-col gap-8">
                            <TaskList />
                            <TeamMemberList />
                        </div>
            case 'calendar':
                return <CalendarPanel />
            case 'settings':
                return <UserSettings />
            case 'files':
                return <FilestorageSettings />
        }
    }
  return <>
      <div className = "flex w-screen min-h-screen" >
          <div className = "flex-1 flex flex-col gap-8 p-8 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-xl" >
             <ProfileHeader />
              <RoleList />
          </div>
          <div className = "flex-4 flex">
          <nav className = "flex-1 p-8 flex flex-col gap-8 pt-10 pb-5">
              {['tasks', 'calendar', 'settings', 'files'].map(view => 
                  (
                      <button
                            key = {view}
                            onClick = {() => setActiveView(view as typeof activeView)}
                            className = {`px-4 py-2 rounded-lg text-left capitalize transition-colors
                                ${activeView === view
                                ? 'bg-purple-600 text-white'
                                : 'hover:bg-purple-100'
                            }`}
                      >
                          {view}
                      </button>

                      ))}

          </nav>
     
         <div className="flex-2 p-8 flex flex-col gap-8">
            {renderContent()}
        </div>
          </div>

      </div>
</>
    
  
};

export default Profile;