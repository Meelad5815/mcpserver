import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({password:""}));
  const expected = process.env.DASHBOARD_PASSWORD?.trim() || process.env.MCP_AUTH_TOKEN?.trim();
  if (!expected || password !== expected) {
    return NextResponse.json({ok:false,error:"Invalid password"},{status:401});
  }
  const response = NextResponse.json({ok:true});
  response.cookies.set("mrk_control","1",{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:60*60*12});
  return response;
}
