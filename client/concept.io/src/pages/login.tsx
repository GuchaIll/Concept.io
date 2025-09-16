
import { useAuth0 } from "@auth0/auth0-react";
import React from "react";

const LoginButton = () => {
  const { loginWithRedirect } = useAuth0();

  return <button onClick={() => loginWithRedirect()} className="bg-gray-200 p-8 flex items-center justify-center ">Log In</button>;
};

export default LoginButton;