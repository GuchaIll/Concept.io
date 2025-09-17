import SettingEntry from "../Panel/SettingEntry";
import SettingCategory from "../Panel/SettingCategory";
const UserSettings = () => {
    
    
    return <>
        <div className = "flex flex-col gap-2">
            <SettingCategory
                name="User Settings"
                children={
                    <div className="flex flex-col gap-4">
                        <SettingEntry name="Name" value="<NAME>" />
                        <SettingEntry name="Email" value="<EMAIL>" />
                        <SettingEntry name="Password" value="*********" />
                    </div>
                }
            />

            <SettingCategory
                name="Canvas Settings"
                children={
                    <div className="flex flex-col gap-4">
                        <SettingEntry name="Canvas Size" value="<NAME>" />
                        <SettingEntry name="Drawing Support" value="<EMAIL>" />
                        <SettingEntry name="Stylus" value="false" />
                    </div>
                }
            />




        </div>
    </>
}

export default UserSettings