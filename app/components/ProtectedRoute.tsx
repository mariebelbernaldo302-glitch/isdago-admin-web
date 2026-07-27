"use client";


import {
useEffect
}
from "react";


import {
useRouter
}
from "next/navigation";


import {
useAuth
}
from "../providers/AuthProvider";




export default function ProtectedRoute({

children

}:{

children:React.ReactNode;

}){


const {

user,

loading

}=useAuth();



const router=useRouter();




useEffect(()=>{


if(!loading && !user){

router.push("/login");

}


},[user,loading]);




if(loading){

return(

<div>

Loading...

</div>

)

}



if(!user){

return null;

}



return children;


}