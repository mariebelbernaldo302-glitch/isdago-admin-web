import {
signOut
}
from "firebase/auth";

import {
auth
}
from "./firebase";



export async function logoutUser(){

await signOut(auth);

}