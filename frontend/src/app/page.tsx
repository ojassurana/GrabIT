export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-4xl font-bold text-black dark:text-white">
          GrabIT
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Your travel assistant for Southeast Asia
        </p>
      </main>
    </div>
  );
}
