import React from 'react';
import { ProgressMeter } from '../components/ProgressMeter';

interface ProductivityMetrics {
  hoursWorked: number;
  goalsCompleted: number;
  totalGoals: number;
  upcomingDeadlines: Array<{
    task: string;
    date: string;
  }>;
}

interface Member {
  id: number;
  name: string;
  role: string;
  profilePic: string;
  metrics?: ProductivityMetrics;
}

interface Team {
  id: number;
  name: string;
  members: Member[];
  teamMetrics: ProductivityMetrics;
}

const teams: Team[] = [
  {
    id: 1,
    name: 'Design Squad',
    members: [
      { 
        id: 1, 
        name: 'Alice', 
        role: 'Designer', 
        profilePic: '/avatars/alice.png',
        metrics: {
          hoursWorked: 32,
          goalsCompleted: 8,
          totalGoals: 10,
          upcomingDeadlines: [
            { task: 'UI Design Review', date: '2025-09-15' },
            { task: 'Design System Update', date: '2025-09-20' }
          ]
        }
      },
      { 
        id: 2, 
        name: 'Bob', 
        role: 'UX', 
        profilePic: '/avatars/bob.png',
        metrics: {
          hoursWorked: 28,
          goalsCompleted: 6,
          totalGoals: 8,
          upcomingDeadlines: [
            { task: 'User Testing', date: '2025-09-12' }
          ]
        }
      },
      { 
        id: 3, 
        name: 'Charlie', 
        role: 'PM', 
        profilePic: '/avatars/charlie.png',
        metrics: {
          hoursWorked: 35,
          goalsCompleted: 12,
          totalGoals: 15,
          upcomingDeadlines: [
            { task: 'Sprint Planning', date: '2025-09-11' },
            { task: 'Client Meeting', date: '2025-09-13' }
          ]
        }
      },
    ],
    teamMetrics: {
      hoursWorked: 95,
      goalsCompleted: 26,
      totalGoals: 33,
      upcomingDeadlines: [
        { task: 'Design Review', date: '2025-09-15' },
        { task: 'Sprint Demo', date: '2025-09-20' }
      ]
    }
  },
  {
    id: 2,
    name: 'Dev Team',
    members: [
      { 
        id: 4, 
        name: 'Dana', 
        role: 'Frontend', 
        profilePic: '/avatars/dana.png',
        metrics: {
          hoursWorked: 38,
          goalsCompleted: 7,
          totalGoals: 10,
          upcomingDeadlines: [
            { task: 'Feature Implementation', date: '2025-09-14' }
          ]
        }
      },
      { 
        id: 5, 
        name: 'Eli', 
        role: 'Backend', 
        profilePic: '/avatars/eli.png',
        metrics: {
          hoursWorked: 36,
          goalsCompleted: 9,
          totalGoals: 12,
          upcomingDeadlines: [
            { task: 'API Documentation', date: '2025-09-16' },
            { task: 'Database Migration', date: '2025-09-18' }
          ]
        }
      },
    ],
    teamMetrics: {
      hoursWorked: 74,
      goalsCompleted: 16,
      totalGoals: 22,
      upcomingDeadlines: [
        { task: 'Code Review', date: '2025-09-14' },
        { task: 'Deployment', date: '2025-09-18' }
      ]
    }
  },
];

// Helper to generate random pastel colors
const randomColor = () =>
  `hsl(${Math.floor(Math.random() * 360)}, 70%, 80%)`;

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
};

const Team: React.FC = () => {
  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Your Teams</h1>
      <div className="grid gap-6">
        {teams.map((team) => (
          <div key={team.id} className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Main team section */}
            <div className="xl:col-span-3 bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">{team.name}</h2>
                <ProgressMeter
                  value={team.teamMetrics.goalsCompleted}
                  max={team.teamMetrics.totalGoals}
                  label="Team Progress"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                {team.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex-1 min-w-[250px] bg-white border rounded-lg p-4 shadow-sm"
                    style={{ borderTopColor: randomColor(), borderTopWidth: '4px' }}
                  >
                    <div className="flex items-center gap-4 mb-3">
                      <img
                        src={member.profilePic}
                        alt={member.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div>
                        <h3 className="font-semibold">{member.name}</h3>
                        <p className="text-sm text-gray-600">{member.role}</p>
                      </div>
                    </div>
                    {member.metrics && (
                      <div className="mt-2">
                        <ProgressMeter
                          value={member.metrics.goalsCompleted}
                          max={member.metrics.totalGoals}
                          label="Personal Progress"
                          size="sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Productivity metrics column */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Team Metrics</h3>
              
              {/* Team Hours */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-600 mb-2">Hours This Week</h4>
                <div className="text-2xl font-bold">{team.teamMetrics.hoursWorked}h</div>
              </div>
              
              {/* Goals Progress */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-600 mb-2">Goals Progress</h4>
                <ProgressMeter
                  value={team.teamMetrics.goalsCompleted}
                  max={team.teamMetrics.totalGoals}
                  label={`${team.teamMetrics.goalsCompleted}/${team.teamMetrics.totalGoals} Complete`}
                  showLabel={true}
                />
              </div>
              
              {/* Upcoming Deadlines */}
              <div>
                <h4 className="text-sm font-medium text-gray-600 mb-2">Upcoming Deadlines</h4>
                <div className="space-y-2">
                  {team.teamMetrics.upcomingDeadlines.map((deadline, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span className="text-sm">{deadline.task}</span>
                      <span className="text-sm text-gray-600">{formatDate(deadline.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Team;
