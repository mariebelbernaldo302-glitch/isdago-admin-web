"use client";


import {

useEffect

}

from "react";


import {

usePathname,

useRouter

}

from "next/navigation";


import {

useAuth

}

from "../providers/AuthProvider";





type AdminGuardProps={


children:React.ReactNode;


allowedRoles?:string[];


};







export default function AdminGuard({

children,

allowedRoles=["admin"]

}:AdminGuardProps){



const {

user,

role,

loading,

error

}=useAuth();



const router=useRouter();


const pathname=usePathname();







useEffect(()=>{


if(loading){

return;

}





if(!user){


if(pathname !== "/login"){

router.replace("/login");

}


return;


}






if(

!role ||

!allowedRoles.includes(role)

){



if(pathname !== "/unauthorized"){

router.replace("/unauthorized");

}


}



},[

user,

role,

loading,

pathname,

router,

allowedRoles

]);







if(loading){


return(


<div className="auth-loading">


<div className="loader"/>


<h3>

Checking account permission...

</h3>


<p>

IsdaGo Admin

</p>


</div>


);


}





if(error){


return(


<div className="auth-error">


<h3>

Authentication Error

</h3>


<p>

{error}

</p>


</div>


);


}





if(

!user ||

!role ||

!allowedRoles.includes(role)

){


return null;


}






return <>{children}</>;



}