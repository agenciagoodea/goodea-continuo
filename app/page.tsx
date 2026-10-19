import Studio from "./studio";
import { requireLocalUser } from "./local-auth";
export const dynamic = "force-dynamic";
export default async function Page() { await requireLocalUser(); return <Studio />; }
