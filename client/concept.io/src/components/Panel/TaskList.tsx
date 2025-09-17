


const tasks = [
    {displayName: 'Task 1', completed: false, assignedTo: 'Alice', dueDate: '2022-01-01', priority: 'High'},
    {displayName: 'Task 1', completed: false, assignedTo: 'Alice', dueDate: '2022-04-61', priority: 'Medium'},
    {displayName: 'Task 1', completed: false, assignedTo: 'Alice', dueDate: '2022-07-31', priority: 'Low'},
    {displayName: 'Task 1', completed: false, assignedTo: 'Alice', dueDate: '2022-08-21', priority: 'High'},
]
const TaskList = () => {
    
   
  return (
    <div className = "bg-gray-50 flex flex-col gap-4">
        <h1 className = "text-lg text-center">Tasks</h1>
        {
            tasks.map(task => (!task.completed ? 
                <div className = {`flex items-center justify-center gap-4 p-2 bg-gray-200 rounded-lg bg-${
                    task.priority === 'High' ? 'red-200' : 
                        task.priority === 'Medium' ? 'yellow-200' : 'green-200'} `}>
                    <h2 className = "text-md">{task.displayName}</h2>
                    <p className = "text-md">{task.assignedTo}</p>
                    <p className = "text-sm">{task.dueDate}</p>
                    <p className = "text-sm">{task.priority}</p>
                </div> : null))
        }
    </div>
  );
};

export default TaskList;