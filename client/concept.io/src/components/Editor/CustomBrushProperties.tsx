


const BrushSets = [
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 2', icon: '/brush.png'},
    {name: 'Brush 3', icon: '/brush.png'},
    {name: 'Brush 4', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
    {name: 'Brush 1', icon: '/brush.png'},
   
]
const CustomBrushProperties = () =>
{
    return <div className = "flex flex-col gap-2 shadow-lg z-50">
        <div className = "border-b bg-gray-600 mb-2 text-white w-full text-md p-2 font-bold">
            <h1> Brush set</h1>
        </div>
        <div className = "grid grid-cols-4 gap-4 overflow-auto">
            {
                BrushSets.map(brush => (
                    <div className = "flex flex-col items-center justify-center  ">
                        <button className = "bg-gray-200 rounded-md w-12 h-12 hover:bg-gray-300 hover:shadow-lg hover:scale-105">
                            <img src={brush.icon} alt={brush.name} className = "w-12 h-12 rounded-full" />
                            <h2 className = "text-xs">{brush.name}</h2>
                        </button>
                      
                    </div>
                ))
            }
        </div>
    </div>
}

export default CustomBrushProperties