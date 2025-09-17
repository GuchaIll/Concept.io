

interface SettingEntryProps {
    name: string;
    value: string;
}
const SettingEntry : React.FC<SettingEntryProps> = (
    {
        name,
        value
    }
) => {
    return <>
        <div className = "flex flex-col">
            <h1 className = "font-bold text-md">{name}</h1>
            <p className = "text-sm">{value}</p>
        </div>
            
    </>
}

export default SettingEntry