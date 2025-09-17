import { useAuth0 } from "@auth0/auth0-react";

const ProfileHeader = () => {
    const { user, isAuthenticated, isLoading } = useAuth0();

    if (isLoading) {
        return <div>Loading ...</div>;
    }

    return (
        isAuthenticated && (
            <div className = "flex flex-col items-center justify-center gap-8 pt-10 pb-5 bg-purple-400">
                <img src={user?.picture} alt={user?.name} className = "w-32 h-32 rounded-2xl" />
                <div className = "flex flex-col items-center justify-center gap-4">
                    <h2 className = "text-lg font-bold" >{user?.name}</h2>
                    <p className = "text-md" >{user?.email}</p>
                </div>

            </div>
        )
    );
};

export default ProfileHeader;