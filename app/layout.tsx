import "./globals.css";

import type { Metadata } from "next";

import {
  Inter
} from "next/font/google";


import {
  AuthProvider
} from "./providers/AuthProvider";



const inter = Inter({

  subsets:["latin"],

  display:"swap",

});




export const metadata: Metadata = {

  title: {
    default:"IsdaGo Admin",
    template:"%s | IsdaGo Admin"
  },

  description:
  "IsdaGo Seafood Marketplace Administration Platform",

  applicationName:
  "IsdaGo Admin",

  keywords:[
    "IsdaGo",
    "Seafood Marketplace",
    "Admin Dashboard",
    "Vendor Management",
    "E-commerce"
  ],


};





export default function RootLayout({

children

}:{

children:React.ReactNode;

}){


return(


<html

lang="en"

suppressHydrationWarning

>


<body

className={inter.className}

>


<AuthProvider>

{children}

</AuthProvider>


</body>


</html>


);


}