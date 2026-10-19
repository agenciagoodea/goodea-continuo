import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {localRequestAllowed} from "../lib/local-access";

export async function getLocalUser(){
  if(!localRequestAllowed(await headers()))return null;
  return {userId:"local-owner",displayName:"Goodea",email:"local@continuo.local",fullName:"Goodea"};
}
export async function requireLocalUser(){const user=await getLocalUser();if(!user)notFound();return user;}
