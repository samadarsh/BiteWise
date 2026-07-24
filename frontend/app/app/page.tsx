import { redirect } from "next/navigation";

export default function AppIndexPage() {
  // The dashboard is split into dedicated product routes; NutriOrder AI is the default.
  redirect("/app/nutriorder");
}
