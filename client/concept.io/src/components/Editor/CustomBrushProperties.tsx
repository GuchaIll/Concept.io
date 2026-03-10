


const BrushSets = [
    {name: 'Brush 1', icon: '/brush.png', ID : 'brush1'},
    {name: 'Brush 2', icon: '/brush.png', ID : 'brush2'},
    {name: 'Brush 3', icon: '/brush.png', ID : 'brush3'},
    {name: 'Brush 4', icon: '/brush.png', ID : 'brush4'},
    {name: 'Brush 5', icon: '/brush.png', ID : 'brush5'},
    {name: 'Brush 6', icon: '/brush.png', ID : 'brush6'},
    {name: 'Brush 7', icon: '/brush.png', ID : 'brush7'},
    {name: 'Brush 8', icon: '/brush.png', ID : 'brush8'},
    {name: 'Brush 9', icon: '/brush.png', ID : 'brush9'},
    {name: 'Brush 10', icon: '/brush.png', ID : 'brush10'},
    {name: 'Brush 11', icon: '/brush.png', ID : 'brush11'},
    {name: 'Brush 12', icon: '/brush.png', ID : 'brush12'},
    {name: 'Brush 1', icon: '/brush.png', ID : 'brush13'},
    {name: 'Brush 1', icon: '/brush.png', ID : 'brush14'},
    {name: 'Brush 1', icon: '/brush.png', ID : 'brush15'},
    {name: 'Brush 1', icon: '/brush.png', ID : 'brush16'},
    {name: 'Brush 1', icon: '/brush.png', ID : 'brush17'},
    {name: 'Brush 1', icon: '/brush.png', ID : 'brush18'},

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
                    <div className = "flex flex-col items-center justify-center  " key = {brush.ID}>
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