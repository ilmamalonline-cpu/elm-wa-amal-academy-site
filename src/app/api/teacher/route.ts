import "server-only";
import { read, updateSession, TeacherFoundationError } from "@/lib/academy/teacher-foundation";
import { teacherBody, teacherCookie, teacherLogin, teacherPublicData, teacherPublicLesson, teacherSecurity, teacherToken, TEACHER_HEADERS } from "@/lib/academy/teacher-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown, request: Request) {
  const safe = error instanceof TeacherFoundationError ? error : new TeacherFoundationError(503, "teacher_roster_unavailable");
  const response = Response.json({ error: safe.code }, { status: safe.status, headers: TEACHER_HEADERS });
  if (safe.status === 401 || safe.code === "teacher_profile_required") response.headers.append("Set-Cookie", teacherCookie("", 0, request.headers.get("host")));
  return response;
}
export async function GET(request: Request) {
  try {
    const offset = teacherSecurity(request);
    const token = teacherToken(request);
    if (!token) throw new TeacherFoundationError(401, "authentication_required");
    const result = await read(token, { offset });
    return Response.json(teacherPublicData(result), { headers: TEACHER_HEADERS });
  } catch (error) { return failure(error, request); }
}
export async function POST(request: Request) {
  try {
    teacherSecurity(request);
    const body = await teacherBody(request);
    if (body.action === "logout" && Object.keys(body).length === 1) {
      // Clear this narrow, non-refreshing workspace cookie only. Never change
      // the guardian cookie or sign out other devices/accounts globally.
      const response = Response.json({ status: "signed_out" }, { headers: TEACHER_HEADERS });
      response.headers.append("Set-Cookie", teacherCookie("", 0, request.headers.get("host")));
      return response;
    }
    if (body.action === "update-session") {
      const token = teacherToken(request);
      if (!token) throw new TeacherFoundationError(401, "authentication_required");
      const lesson = await updateSession(token, body);
      return Response.json({ lesson: teacherPublicLesson(lesson) }, { headers: TEACHER_HEADERS });
    }
    if (body.action !== "login") throw new TeacherFoundationError(400, "invalid_request");
    // Supabase Auth is the authoritative distributed password rate limiter.
    // No user/account creation or administrative schedule writes are exposed.
    const result = await teacherLogin(body);
    const response = Response.json(result.data, { headers: TEACHER_HEADERS });
    response.headers.append("Set-Cookie", teacherCookie(result.token, result.maxAge, request.headers.get("host")));
    return response;
  } catch (error) { return failure(error, request); }
}
