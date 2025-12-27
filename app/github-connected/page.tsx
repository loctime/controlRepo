// app/github-connected/page.tsx

export default function GitHubConnectedPage() {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">
            GitHub conectado correctamente
          </h1>
  
          <p className="text-muted-foreground">
            Ya podés indexar repositorios.
          </p>
  
          <a
            href="/"
            className="inline-block px-4 py-2 rounded-md bg-black text-white"
          >
            Volver
          </a>
        </div>
      </div>
    )
  }
  