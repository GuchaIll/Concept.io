
import {type JSX} from "react";

interface SettingCategoryProps {
    name: string;
    children: JSX.Element;
}
const SettingCategory : React.FC<SettingCategoryProps> = (
    {
        name,
        children
    }
) =>
{
    return <>
        <div className = "flex">
            <h1 className = "text-lg font-bold">
                {name}
            </h1>
            {
                children
            }
        </div>
       
    </>
}


export default SettingCategory