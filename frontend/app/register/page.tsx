import AuthForm from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-amber-50/40 px-4 py-10">
      <AuthForm mode="register" />
    </main>
  );
}
