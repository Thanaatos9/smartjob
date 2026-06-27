import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Exclut les routes /api/* : elles gèrent leur propre auth et renvoient un
    // JSON 401. Sinon le proxy redirige (307 -> /login) les fetch DELETE/POST,
    // que fetch suit silencieusement (200), faisant échouer les suppressions.
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
