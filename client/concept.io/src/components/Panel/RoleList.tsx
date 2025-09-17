

const Roles = [
    {role: "Project Manager", link: "/"},
    {role: "Designer", link: "/"},
    {role: "Sound Designer", link: "/"}
]
const RoleList = () =>
{
    return <>
        <ul>
        {Roles.map(pos => (
            
              <li> 
                  <h1 className = "text-lg"> {pos.role}</h1>
              </li>
            ))}

        </ul>
    </>
}

export default RoleList